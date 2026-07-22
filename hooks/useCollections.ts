import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Collection } from "@/shared/types";

const COLLECTIONS_KEY = ["collections"];

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

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, emoji }: { name: string; emoji: string }) => {
      const { data, error } = await supabase
        .from("collections")
        .insert({ name, emoji })
        .select()
        .single();
      if (error) throw error;
      return data as Collection;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: COLLECTIONS_KEY }),
  });
}
