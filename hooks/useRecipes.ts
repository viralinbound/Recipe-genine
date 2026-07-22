import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import type { Recipe } from "@/shared/types";

const RECIPES_KEY = ["recipes"];

export function useRecipes() {
  const userId = useAuthStore((s) => s.session?.user.id);

  return useQuery({
    queryKey: RECIPES_KEY,
    enabled: !!userId,
    queryFn: async (): Promise<Recipe[]> => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: [...RECIPES_KEY, id],
    enabled: !!id,
    queryFn: async (): Promise<Recipe> => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase
        .from("recipes")
        .update({ is_favorite })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
  });
}

export function useSaveRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipe: Partial<Recipe>) => {
      const { data, error } = await supabase
        .from("recipes")
        .insert(recipe)
        .select()
        .single();
      if (error) throw error;
      return data as Recipe;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
  });
}
