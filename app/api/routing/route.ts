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

  const hasUsableGeometry = (route: {
    geometry?: { coordinates?: [number, number][] };
  }) => {
    const coordinates = route.geometry?.coordinates;
    return (
      Array.isArray(coordinates) &&
      coordinates.length >= 2 &&
      coordinates.every(
        (coordinate) =>
          Array.isArray(coordinate) &&
          coordinate.length >= 2 &&
          coordinate.every(Number.isFinite),
      )
    );
  };

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
    const osrmRoutes = Array.isArray(data.routes)
      ? data.routes.filter(hasUsableGeometry)
      : [];
    const routeCandidates = [...osrmRoutes];
    const fallback: [number, number][] = [
      [originLongitude, originLatitude],
      [destinationLongitude, destinationLatitude],
    ];

    const routes = routeCandidates.map((route, index) => {
      const mappedRoute = mapRoute(route, index);
      return {
        ...mappedRoute,
        coordinates: [
          [originLongitude, originLatitude],
          ...mappedRoute.coordinates.slice(1, -1),
          [destinationLongitude, destinationLatitude],
        ] as [number, number][],
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
