// Supabase Edge Function: meal-planner
// Deploy: supabase functions deploy meal-planner
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a meal-planning assistant. Given a user's list of saved recipes
(title, cuisine, prep/cook time, tags), build a 7-day meal plan (Mon-Sun) with Breakfast,
Lunch, Snack, and Dinner slots per day, reusing the user's own saved recipes wherever
possible (repeat recipes across the week if needed — that's fine and realistic). Only invent
a simple recipe title for a slot if there truly aren't enough saved recipes to fill it,
and keep any invented meals simple and clearly labeled as such in quick_prep_note.
If "make_healthy" is true, bias choices toward lighter/healthier options and mention that
in prep tips. Also produce a consolidated shopping list across the week (deduplicated,
reasonable quantities) and 2-4 short prep tips.

Return ONLY valid JSON, no markdown fences, in this exact shape:
{
  "days": [
    {
      "day": "Mon",
      "meals": [
        { "meal": "Breakfast", "recipe_title": string, "recipe_id": string | null, "quick_prep_note": string },
        { "meal": "Lunch", "recipe_title": string, "recipe_id": string | null, "quick_prep_note": string },
        { "meal": "Snack", "recipe_title": string, "recipe_id": string | null, "quick_prep_note": string },
        { "meal": "Dinner", "recipe_title": string, "recipe_id": string | null, "quick_prep_note": string }
      ]
    }
  ],
  "shopping_list": [{ "item": string, "quantity": string | null }],
  "prep_tips": string[]
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

    const { make_healthy } = await req.json().catch(() => ({ make_healthy: false }));

    const { data: recipes, error: recipesErr } = await supabase
      .from("recipes")
      .select("id, title, cuisine, prep_time, cook_time, tags")
      .eq("user_id", user.id)
      .limit(100);
    if (recipesErr) throw recipesErr;

    if (!recipes || recipes.length === 0) {
      return new Response(
        JSON.stringify({ error: "Save a few recipes first so we have something to plan with." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
            content: JSON.stringify({ make_healthy: !!make_healthy, recipes }),
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`OpenAI request failed: ${await aiRes.text()}`);
    }

    const aiData = await aiRes.json();
    const plan = JSON.parse(aiData.choices?.[0]?.message?.content ?? "{}");

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("meal-planner error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
