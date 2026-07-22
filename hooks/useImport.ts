import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { HealthyVersionResult, MealPlan, Recipe } from "@/shared/types";

// supabase.functions.invoke() reports any non-2xx response as a generic
// FunctionsHttpError ("Edge Function returned a non-2xx status code") and hides
// the JSON body. Our edge functions return a helpful { error } message in that
// body, so pull it out and surface it to the user.
async function fnErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error as string;
    } catch {
      // ignore — fall through to the generic message
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export function useImportRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (url: string): Promise<Recipe> => {
      const { data, error } = await supabase.functions.invoke("import-recipe", {
        body: { url },
      });
      if (error) throw new Error(await fnErrorMessage(error, "Import failed."));
      if (data?.error) throw new Error(data.error);
      return data.recipe as Recipe;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

export function useMakeHealthy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipeId: string): Promise<HealthyVersionResult> => {
      const { data, error } = await supabase.functions.invoke("make-healthy", {
        body: { recipeId },
      });
      if (error) throw new Error(await fnErrorMessage(error, "Couldn't make a healthy version."));
      if (data?.error) throw new Error(data.error);
      // The edge function returns { recipe, healthBenefits, calorieReduction }
      // (camelCase; calorieReduction is a string like "30% fewer calories").
      // Normalize it to HealthyVersionResult so the UI can rely on the shape.
      const pctMatch = String(data?.calorieReduction ?? "").match(/\d+/);
      return {
        recipe: data?.recipe ?? {},
        calorie_reduction_percent: pctMatch ? parseInt(pctMatch[0], 10) : 0,
        health_benefits: Array.isArray(data?.healthBenefits) ? data.healthBenefits : [],
      } satisfies HealthyVersionResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

export function useMealPlanner() {
  return useMutation({
    mutationFn: async (makeHealthy: boolean): Promise<MealPlan> => {
      const { data, error } = await supabase.functions.invoke("meal-planner", {
        body: { healthy: makeHealthy },
      });
      if (error) throw new Error(await fnErrorMessage(error, "Couldn't build a meal plan."));
      if (data?.error) throw new Error(data.error);
      return data as MealPlan;
    },
  });
}
