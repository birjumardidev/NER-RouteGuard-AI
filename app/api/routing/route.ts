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
  const url = `https://router.project-osrm.org/route/v1/driving/${origin};${destination}?overview=full&geometries=geojson&steps=true&alternatives=true`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`OSRM returned ${response.status}`);
    const data = await response.json();
    const osrmRoutes = Array.isArray(data.routes) ? data.routes : [];
    const fallback = [
      [originLongitude, originLatitude],
      [destinationLongitude, destinationLatitude],
    ];

    const routes = osrmRoutes.map(
      (
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
          : fallback,
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
      }),
    );

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
