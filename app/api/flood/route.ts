import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://flood-api.open-meteo.com/v1/flood?latitude=${latitude}&longitude=${longitude}&daily=river_discharge&forecast_days=1`, {
      next: { revalidate: 3600 }
    });
    
    if (!response.ok) throw new Error("Flood API failed");
    
    const data = await response.json();
    const discharge = data.daily?.river_discharge?.[0] || 0;
    
    let level = "Normal";
    let trend = "Steady";
    
    // Arbitrary discharge thresholds for demo purposes
    if (discharge > 15000) {
      level = "Extreme Danger";
      trend = "Rising";
    } else if (discharge > 5000) {
      level = "Danger";
      trend = "Rising";
    } else if (discharge > 1000) {
      level = "Warning";
      trend = "Rising";
    }

    return NextResponse.json({
      source: "Open-Meteo GloFAS",
      available: true,
      river: "Local River",
      level,
      trend,
      discharge,
      observedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      source: "Open-Meteo GloFAS",
      available: false,
      river: "Unknown",
      level: "Normal",
      trend: "Steady",
      observedAt: new Date().toISOString(),
    });
  }
}

export async function POST(request: Request) {
  try {
    const { coordinates } = await request.json();
    
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return NextResponse.json({ error: "Invalid coordinates array" }, { status: 400 });
    }

    // Sample up to 15 points along the route to check for flood risk
    const sampledCoords = [];
    const numSamples = 15;
    const step = Math.max(1, Math.floor(coordinates.length / numSamples));
    
    for (let i = 0; i < coordinates.length; i += step) {
      sampledCoords.push(coordinates[i]);
    }
    // Always include the destination
    if (sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) {
      sampledCoords.push(coordinates[coordinates.length - 1]);
    }

    const lats = sampledCoords.map(c => c[1]).join(",");
    const lons = sampledCoords.map(c => c[0]).join(",");

    const response = await fetch(`https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lons}&daily=river_discharge&forecast_days=1`, {
      next: { revalidate: 3600 }
    });
    
    if (!response.ok) throw new Error("Flood API failed");
    
    const data = await response.json();
    const results = Array.isArray(data) ? data : [data];
    
    let maxDischarge = 0;
    for (const res of results) {
      const discharge = res.daily?.river_discharge?.[0] || 0;
      if (discharge > maxDischarge) {
        maxDischarge = discharge;
      }
    }
    
    let level = "Normal";
    let trend = "Steady";
    
    if (maxDischarge > 15000) {
      level = "Extreme Danger";
      trend = "Rising";
    } else if (maxDischarge > 5000) {
      level = "Danger";
      trend = "Rising";
    } else if (maxDischarge > 1000) {
      level = "Warning";
      trend = "Rising";
    }

    return NextResponse.json({
      source: "Open-Meteo GloFAS",
      available: true,
      river: "Multiple Points (Route)",
      level,
      trend,
      discharge: maxDischarge,
      observedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      source: "Open-Meteo GloFAS",
      available: false,
      river: "Unknown",
      level: "Normal",
      trend: "Steady",
      observedAt: new Date().toISOString(),
    });
  }
}
