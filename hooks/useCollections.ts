import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import type { Collection, Recipe } from "@/shared/types";

const COLLECTIONS_KEY = ["collections"];
const RECIPE_COLLECTIONS_KEY = ["recipe_collections"];

export function useCollections() {
  return useQuery({
    queryKey: COLLECTIONS_KEY,
    queryFn: async (): Promise<Collection[]> => {
      const { data, error } = await supabase
        .from("collections")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCollection(id: string | undefined) {
  return useQuery({
    queryKey: [...COLLECTIONS_KEY, id],
    enabled: !!id,
    queryFn: async (): Promise<Collection> => {
      const { data, error } = await supabase
        .from("collections")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

// Recipes belonging to a given collection, via the recipe_collections join table.
export function useCollectionRecipes(collectionId: string | undefined) {
  return useQuery({
    queryKey: [...COLLECTIONS_KEY, collectionId, "recipes"],
    enabled: !!collectionId,
    queryFn: async (): Promise<Recipe[]> => {
      const { data, error } = await supabase
        .from("recipe_collections")
        .select("recipes(*)")
        .eq("collection_id", collectionId);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.recipes).filter(Boolean);
    },
  });
}

// Which collection ids a given recipe already belongs to, so the "add to
// collection" picker can show existing membership.
export function useRecipeCollectionIds(recipeId: string | undefined) {
  return useQuery({
    queryKey: [...RECIPE_COLLECTIONS_KEY, recipeId],
    enabled: !!recipeId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("recipe_collections")
        .select("collection_id")
        .eq("recipe_id", recipeId);
      if (error) throw error;
      return (data ?? []).map((row) => row.collection_id);
    },
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);
  return useMutation({
    mutationFn: async ({ name, emoji }: { name: string; emoji: string }) => {
      if (!userId) throw new Error("Not signed in.");
      const { data, error } = await supabase
        .from("collections")
        .insert({ name, emoji, user_id: userId })
        .select()
        .single();
      if (error) throw error;
      return data as Collection;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COLLECTIONS_KEY }),
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("collections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COLLECTIONS_KEY }),
  });
}

export function useAddRecipeToCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recipeId,
      collectionId,
    }: {
      recipeId: string;
      collectionId: string;
    }) => {
      const { error } = await supabase
        .from("recipe_collections")
        .insert({ recipe_id: recipeId, collection_id: collectionId });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      qc.invalidateQueries({ queryKey: [...RECIPE_COLLECTIONS_KEY, vars.recipeId] });
    },
  });
}

export function useRemoveRecipeFromCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recipeId,
      collectionId,
    }: {
      recipeId: string;
      collectionId: string;
    }) => {
      const { error } = await supabase
        .from("recipe_collections")
        .delete()
        .eq("recipe_id", recipeId)
        .eq("collection_id", collectionId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      qc.invalidateQueries({ queryKey: [...RECIPE_COLLECTIONS_KEY, vars.recipeId] });
    },
  });
}
