// Supabase Edge Function: make-healthy
// Deploy: supabase functions deploy make-healthy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a recipe nutritionist. Given a recipe as JSON, produce a healthier
version: swap ingredients (e.g. reduce oil/sugar/refined carbs, add vegetables, use leaner
proteins, whole grains) while keeping it recognizably the same dish. Adjust instructions to
match any ingredient changes. Estimate the percentage reduction in calories versus the
original (a reasonable integer estimate, not a precise lab measurement).

Return ONLY valid JSON, no markdown fences, in this exact shape:
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
  "calorie_reduction_percent": number,
  "health_benefits": string[]
}`;

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

    const { recipe_id } = await req.json();
    if (!recipe_id) {
      return new Response(JSON.stringify({ error: "Missing recipe_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: original, error: fetchErr } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", recipe_id)
      .single();
    if (fetchErr || !original) {
      return new Response(JSON.stringify({ error: "Recipe not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
          {
            role: "user",
            content: JSON.stringify({
              title: original.title,
              ingredients: original.ingredients,
              instructions: original.instructions,
              prep_time: original.prep_time,
              cook_time: original.cook_time,
              servings: original.servings,
              cuisine: original.cuisine,
            }),
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`OpenAI request failed: ${await aiRes.text()}`);
    }

    const aiData = await aiRes.json();
    const result = JSON.parse(aiData.choices?.[0]?.message?.content ?? "{}");

    const { data: newRecipe, error: insertErr } = await supabase
      .from("recipes")
      .insert({
        user_id: user.id,
        title: result.title ?? `${original.title} (Healthy)`,
        description: result.description ?? original.description,
        ingredients: result.ingredients ?? original.ingredients,
        instructions: result.instructions ?? original.instructions,
        prep_time: result.prep_time ?? original.prep_time,
        cook_time: result.cook_time ?? original.cook_time,
        servings: result.servings ?? original.servings,
        difficulty: result.difficulty ?? original.difficulty,
        cuisine: result.cuisine ?? original.cuisine,
        hero_image: original.hero_image,
        source_url: original.source_url,
        source_type: original.source_type,
        tags: [...(original.tags ?? []), "healthy"],
        chef_notes: result.chef_notes ?? null,
        tips: result.tips ?? null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        recipe: newRecipe,
        calorie_reduction_percent: result.calorie_reduction_percent ?? 0,
        health_benefits: result.health_benefits ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("make-healthy error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
