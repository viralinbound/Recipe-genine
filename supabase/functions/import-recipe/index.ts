// Supabase Edge Function: import-recipe
// Deploy: supabase functions deploy import-recipe
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function detectSourceType(url: string): "youtube" | "instagram" | "blog" {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/instagram\.com/i.test(url)) return "instagram";
  return "blog";
}

async function fetchYouTube(url: string) {
  const videoIdMatch = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  const videoId = videoIdMatch?.[1];

  const oembedRes = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  );
  const oembed = oembedRes.ok ? await oembedRes.json() : {};

  // Description isn't available via oEmbed; scrape the watch page for a
  // best-effort description (YouTube doesn't expose transcripts publicly).
  let description = "";
  try {
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CookPilotBot/1.0)" },
    });
    const html = await pageRes.text();
    const match = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (match) {
      description = JSON.parse(`"${match[1]}"`);
    }
  } catch (_e) {
    // best-effort only
  }

  return {
    title: oembed.title ?? "",
    thumbnail: oembed.thumbnail_url ?? null,
    text: `${oembed.title ?? ""}\n\n${description}`.trim(),
  };
}

async function fetchBlogOrInstagram(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CookPilotBot/1.0)" },
  });
  const html = await res.text();

  // Prefer JSON-LD structured Recipe data when present.
  const ldJsonBlocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].map((m) => m[1]);

  let recipeJsonLd: any = null;
  for (const block of ldJsonBlocks) {
    try {
      const parsed = JSON.parse(block);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        const graph = c["@graph"] ? c["@graph"] : [c];
        for (const g of graph) {
          const type = g["@type"];
          const types = Array.isArray(type) ? type : [type];
          if (types.includes("Recipe")) {
            recipeJsonLd = g;
          }
        }
      }
    } catch (_e) {
      // skip malformed JSON-LD blocks
    }
  }

  let thumbnail: string | null = null;
  const ogImageMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogImageMatch) thumbnail = ogImageMatch[1];

  if (recipeJsonLd) {
    // Strip to essential fields to stay well under the OpenAI token limit.
    const essential = {
      name: recipeJsonLd.name,
      description: recipeJsonLd.description,
      recipeIngredient: recipeJsonLd.recipeIngredient,
      recipeInstructions: recipeJsonLd.recipeInstructions,
      prepTime: recipeJsonLd.prepTime,
      cookTime: recipeJsonLd.cookTime,
      totalTime: recipeJsonLd.totalTime,
      recipeYield: recipeJsonLd.recipeYield,
      recipeCuisine: recipeJsonLd.recipeCuisine,
      image: recipeJsonLd.image,
    };
    if (!thumbnail) {
      const img = essential.image;
      thumbnail = Array.isArray(img) ? img[0] : typeof img === "string" ? img : img?.url ?? null;
    }
    return { text: JSON.stringify(essential), thumbnail };
  }

  // Fallback: strip tags and use a truncated slice of body text.
  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
  const rawText = (bodyMatch ? bodyMatch[0] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { text: rawText.slice(0, 8000), thumbnail };
}

const SYSTEM_PROMPT = `You extract structured recipe data from raw web page text or video descriptions.
Return ONLY valid JSON matching this exact shape, nothing else, no markdown fences:
{
  "title": string,
  "description": string | null,
  "ingredients": [{ "item": string, "quantity": string | null, "notes": string | null }],
  "instructions": [{ "step": number, "text": string }],
  "prep_time": number | null,
  "cook_time": number | null,
  "servings": number | null,
  "difficulty": "easy" | "medium" | "hard" | null,
  "cuisine": string | null,
  "chef_notes": string | null,
  "tips": string[] | null,
  "tags": string[]
}
Time fields are in minutes. If the page is clearly not a recipe (no ingredients/instructions
can be found), return exactly: {"error": "no_recipe"}`;

async function extractRecipeWithAI(rawText: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: rawText },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI request failed: ${errText}`);
  }

  const data = await res.json();
  let content: string = data.choices?.[0]?.message?.content ?? "{}";

  // Repair truncated JSON via simple bracket balancing, in case max_tokens cut it off.
  const openBraces = (content.match(/{/g) || []).length;
  const closeBraces = (content.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    content += "}".repeat(openBraces - closeBraces);
  }
  const openBrackets = (content.match(/\[/g) || []).length;
  const closeBrackets = (content.match(/]/g) || []).length;
  if (openBrackets > closeBrackets) {
    content += "]".repeat(openBrackets - closeBrackets);
  }

  return JSON.parse(content);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourceType = detectSourceType(url);
    const fetched =
      sourceType === "youtube" ? await fetchYouTube(url) : await fetchBlogOrInstagram(url);

    const extracted = await extractRecipeWithAI(fetched.text);

    if (extracted.error === "no_recipe") {
      return new Response(JSON.stringify({ error: "no_recipe" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: recipe, error: insertErr } = await supabase
      .from("recipes")
      .insert({
        user_id: user.id,
        title: extracted.title,
        description: extracted.description ?? null,
        ingredients: extracted.ingredients ?? [],
        instructions: extracted.instructions ?? [],
        prep_time: extracted.prep_time ?? null,
        cook_time: extracted.cook_time ?? null,
        servings: extracted.servings ?? null,
        difficulty: extracted.difficulty ?? null,
        cuisine: extracted.cuisine ?? null,
        hero_image: fetched.thumbnail ?? null,
        source_url: url,
        source_type: sourceType,
        tags: extracted.tags ?? [],
        chef_notes: extracted.chef_notes ?? null,
        tips: extracted.tips ?? null,
        raw_transcript: fetched.text.slice(0, 10000),
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ recipe }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("import-recipe error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
