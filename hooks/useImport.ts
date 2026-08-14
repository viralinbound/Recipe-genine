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
      // The edge function reads `recipe_id` (snake_case) from the body — it
      // was previously sent as `recipeId`, which the function never saw,
      // always failing with "Missing recipe_id".
      const { data, error } = await supabase.functions.invoke("make-healthy", {
        body: { recipe_id: recipeId },
      });
      if (error) throw new Error(await fnErrorMessage(error, "Couldn't make a healthy version."));
      if (data?.error) throw new Error(data.error);
      // The edge function returns { recipe, calorie_reduction_percent,
      // health_benefits } (snake_case; calorie_reduction_percent is already a number).
      return {
        recipe: data?.recipe ?? {},
        calorie_reduction_percent:
          typeof data?.calorie_reduction_percent === "number" ? data.calorie_reduction_percent : 0,
        health_benefits: Array.isArray(data?.health_benefits) ? data.health_benefits : [],
      } satisfies HealthyVersionResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

interface MealPlannerInput {
  makeHealthy: boolean;
  preferences?: string;
  preferredRecipeIds?: string[];
}

export function useMealPlanner() {
  return useMutation({
    mutationFn: async (input: MealPlannerInput): Promise<MealPlan> => {
      const { data, error } = await supabase.functions.invoke("meal-planner", {
        body: {
          make_healthy: input.makeHealthy,
          preferences: input.preferences?.trim() || undefined,
          preferred_recipe_ids: input.preferredRecipeIds?.length
            ? input.preferredRecipeIds
            : undefined,
        },
      });
      if (error) throw new Error(await fnErrorMessage(error, "Couldn't build a meal plan."));
      if (data?.error) throw new Error(data.error);
      return data as MealPlan;
    },
  });
}
