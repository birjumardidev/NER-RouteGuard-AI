import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const origin = searchParams.get("origin") || "91.7362,26.1445";
  const destination = searchParams.get("destination") || "93.9368,24.817";
  const [originLongitude, originLatitude] = origin.split(",").map(Number);
  const [destinationLongitude, destinationLatitude] = destination
    .split(",")
    .map(Number);
  if (
    ![
      originLongitude,
      originLatitude,
      destinationLongitude,
      destinationLatitude,
    ].every(Number.isFinite)
  ) {
    return NextResponse.json(
      { error: "Invalid route coordinates" },
      { status: 400 },
    );
  }
  const buildUrl = (coordinates: string) =>
    `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=true`;

  const mapRoute = (
    route: {
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: [number, number][] };
      legs?: Array<{
        steps?: Array<{
          distance?: number;
          name?: string;
          maneuver?: {
            type?: string;
            modifier?: string;
            instruction?: string;
          };
        }>;
      }>;
    },
    index: number,
  ) => ({
    id: `route-${index + 1}`,
    label: `Route ${String.fromCharCode(65 + index)}`,
    disrupted: false,
    distance: Math.round(route.distance ?? 0),
    duration: Math.round(route.duration ?? 0),
    coordinates: Array.isArray(route.geometry?.coordinates)
      ? route.geometry.coordinates
      : [],
    steps: (route.legs?.flatMap((leg) => leg.steps ?? []) ?? []).map(
      (step) => ({
        instruction:
          step.maneuver?.instruction ||
          [step.maneuver?.type, step.maneuver?.modifier, step.name]
            .filter(Boolean)
            .join(" ") ||
          "Continue on the current road",
        road: step.name || "Unnamed road",
        distance: Math.round(step.distance ?? 0),
      }),
    ),
  });

  try {
    const response = await fetch(buildUrl(`${origin};${destination}`), {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`OSRM returned ${response.status}`);
    const data = await response.json();
    const osrmRoutes = Array.isArray(data.routes) ? data.routes : [];
    const routeCandidates = [...osrmRoutes];

    if (routeCandidates.length < 2) {
      const midpointLongitude = (originLongitude + destinationLongitude) / 2;
      const midpointLatitude = (originLatitude + destinationLatitude) / 2;
      const longitudeDelta = destinationLongitude - originLongitude;
      const latitudeDelta = destinationLatitude - originLatitude;
      const length = Math.hypot(longitudeDelta, latitudeDelta) || 1;
      const offset = Math.min(Math.max(length * 0.12, 0.15), 0.6);
      const perpendicular = [
        (midpointLongitude - (latitudeDelta / length) * offset).toFixed(5),
        (midpointLatitude + (longitudeDelta / length) * offset).toFixed(5),
      ];
      const alternateUrl = buildUrl(
        `${origin};${perpendicular.join(",")};${destination}`,
      );
      const alternateResponse = await fetch(alternateUrl, {
        cache: "no-store",
      });
      if (alternateResponse.ok) {
        const alternateData = await alternateResponse.json();
        const alternateRoute = Array.isArray(alternateData.routes)
          ? alternateData.routes[0]
          : undefined;
        if (
          alternateRoute &&
          (osrmRoutes.length === 0 ||
            Math.abs(alternateRoute.distance - osrmRoutes[0].distance) >
              osrmRoutes[0].distance * 0.02)
        ) {
          routeCandidates.push(alternateRoute);
        }
      }
    }
    const fallback = [
      [originLongitude, originLatitude],
      [destinationLongitude, destinationLatitude],
    ];

    const routes = routeCandidates.map((route, index) => {
      const mappedRoute = mapRoute(route, index);
      return {
        ...mappedRoute,
        coordinates:
          mappedRoute.coordinates.length > 1
            ? mappedRoute.coordinates
            : fallback,
      };
    });

    if (routes.length === 0) {
      routes.push({
        id: "route-1",
        label: "Route A",
        disrupted: false,
        distance: 0,
        duration: 0,
        coordinates: fallback,
        steps: [],
      });
    }

    return NextResponse.json({
      provider: "OSRM / OpenStreetMap",
      routes,
    });
  } catch {
    return NextResponse.json({
      provider: "fallback",
      routes: [
        {
          id: "route-1",
          label: "Route A",
          disrupted: false,
          distance: 0,
          duration: 0,
          coordinates: [
            [originLongitude, originLatitude],
            [destinationLongitude, destinationLatitude],
          ],
          steps: [],
        },
      ],
    });
  }
}
