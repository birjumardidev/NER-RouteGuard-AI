import { NextResponse } from "next/server";

type RouteSummary = {
  id: string;
  label: string;
  distance: number;
  duration: number;
  steps?: Array<{ instruction: string; road: string; distance: number }>;
};

export async function POST(request: Request) {
  let fallbackId = "";

  try {
    const {
      routes = [],
      cargo = "cargo",
      vehicle = "vehicle",
    } = (await request.json()) as {
      routes?: RouteSummary[];
      cargo?: string;
      vehicle?: string;
    };

    const validRoutes = routes.filter((route) => route?.id && route?.label);
    if (validRoutes.length === 0) {
      return NextResponse.json(
        { error: "No routes to compare" },
        { status: 400 },
      );
    }

    const fallback = validRoutes.reduce((best, route) =>
      route.duration < best.duration ? route : best,
    );
    fallbackId = fallback.id;

    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({
        provider: "route metrics fallback",
        recommendedRouteId: fallbackId,
        reason:
          "No GROQ_API_KEY is configured, so the fastest available route was selected.",
      });
    }

    const simplifiedRoutes = validRoutes.map(({ id, label, distance, duration }) => ({
      id,
      label,
      distance,
      duration,
    }));

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Switches to a standard non-reasoning chat model from your API list
          model: "groq/compound-mini", 
          temperature: 0.1,
          max_tokens: 200,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'Compare driving routes for a logistics trip. You must respond ONLY with a valid JSON object containing exactly two keys: "recommendedRouteId" and "reason" (do not use numbers in reason). Do not include markdown formatting or any other text.',
            },
            {
              role: "user",
              content: JSON.stringify({ cargo, vehicle, routes: simplifiedRoutes }),
            },
          ],
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const providerMessage =
        typeof errorData?.error?.message === "string"
          ? errorData.error.message
          : `Groq returned HTTP ${response.status}`;
      throw new Error(providerMessage);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    let result: { recommendedRouteId?: string; reason?: string } = {};
    if (rawContent) {
      try {
        result = JSON.parse(rawContent);
      } catch {
        console.warn("Failed to parse Groq response JSON:", rawContent);
      }
    }

    const recommended = validRoutes.find(
      (route) => route.id === result.recommendedRouteId,
    );

    return NextResponse.json({
      provider: "Groq AI",
      recommendedRouteId: recommended?.id || fallbackId,
      reason:
        typeof result.reason === "string"
          ? result.reason
          : "Best overall balance of route time and distance.",
    });
  } catch (error) {
    console.error("Groq route comparison failed:", error);

    return NextResponse.json({
      provider: "route metrics fallback",
      recommendedRouteId: fallbackId,
      reason: `Groq comparison failed (${error instanceof Error ? error.message : "unknown error"}). Default route selected.`,
    });
  }
}