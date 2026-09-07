import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) return NextResponse.json([]);

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(query)}`,
    {
      headers: { "User-Agent": "NER-RouteGuard-AI/1.0" },
      next: { revalidate: 3600 },
    },
  );
  if (!response.ok) return NextResponse.json([]);
  const places = await response.json();
  return NextResponse.json(
    places.map((place: { display_name: string; lat: string; lon: string }) => ({
      name: place.display_name.split(",").slice(0, 2).join(","),
      lat: place.lat,
      lon: place.lon,
    })),
  );
}
