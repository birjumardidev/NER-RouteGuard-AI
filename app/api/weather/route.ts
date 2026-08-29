import { NextResponse } from "next/server";

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function weatherCodeDescription(code: number) {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code >= 95) return "Thunderstorm";
  if (code <= 67 || code >= 80) return "Rain showers";
  if (code <= 77) return "Snow conditions";
  if (code <= 82) return "Rain showers";
  return "Current conditions";
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json(
      { error: "Invalid weather coordinates" },
      { status: 400 },
    );
  }

  const imdUrl = `https://mausam.imd.gov.in/api/current_wx_api.php?lat=${latitude}&lon=${longitude}`;
  try {
    const response = await fetch(imdUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "NER-SmartRoute/1.0",
      },
      next: { revalidate: 600 },
    });
    if (!response.ok) throw new Error(`IMD returned ${response.status}`);
    const payload = await response.json();
    const weather = Array.isArray(payload)
      ? payload[0]
      : payload?.data || payload;
    const temperature = firstNumber(
      weather?.temp,
      weather?.temperature,
      weather?.TEMP,
    );
    const humidity = firstNumber(weather?.rh, weather?.humidity, weather?.RH);
    const rainfall = firstNumber(
      weather?.rain,
      weather?.rainfall,
      weather?.RAIN,
    );
    const description =
      weather?.weatherDescription ||
      weather?.weather_desc ||
      weather?.description ||
      "Current conditions";
    return NextResponse.json({
      source: "IMD",
      available: true,
      description,
      temperature,
      humidity,
      rainfall,
      observedAt: weather?.last_updated || weather?.observation_time || null,
    });
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("401"))) {
      console.error("IMD weather request failed:", error);
    }
    try {
      const fallbackUrl = `${process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast"}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&timezone=auto`;
      const fallbackResponse = await fetch(fallbackUrl, {
        next: { revalidate: 600 },
      });
      if (!fallbackResponse.ok)
        throw new Error(`Weather fallback returned ${fallbackResponse.status}`);
      const fallback = await fallbackResponse.json();
      const current = fallback.current || {};
      return NextResponse.json({
        source: "Open-Meteo fallback",
        available: true,
        description: weatherCodeDescription(Number(current.weather_code)),
        temperature: firstNumber(current.temperature_2m),
        humidity: firstNumber(current.relative_humidity_2m),
        rainfall: firstNumber(current.precipitation),
        observedAt: current.time || null,
      });
    } catch (fallbackError) {
      console.error("Weather fallback failed:", fallbackError);
      return NextResponse.json({
        source: "IMD",
        available: false,
        description: "Weather report unavailable",
        temperature: null,
        humidity: null,
        rainfall: null,
      });
    }
  }
}
