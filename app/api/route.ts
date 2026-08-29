import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ service: "NER SmartRoute AI", status: "online" });
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    from = "Guwahati, Assam",
    to = "Imphal, Manipur",
    cargo = "Medicine",
    vehicle = "Medium truck",
  } = body;

  return NextResponse.json({
    recommendation: "Route B",
    from,
    to,
    cargo,
    vehicle,
    distance: "215 km",
    eta: "6h 05m",
    arrival: "6:30 PM",
    safetyScore: 86,
    riskLevel: "LOW",
    hazards: [
      { type: "landslide", label: "Landslide prone zone", distance: "18 km", severity: "medium" },
      { type: "rainfall", label: "Heavy rainfall area", distance: "28 km", severity: "high" },
      { type: "bridge", label: "Narrow bridge", distance: "42 km", severity: "low" },
    ],
    generatedAt: new Date().toISOString(),
  });
}