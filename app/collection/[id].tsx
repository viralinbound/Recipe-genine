import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Clock, Trash2, X } from "lucide-react-native";
import {
  useCollection,
  useCollectionRecipes,
  useDeleteCollection,
  useRemoveRecipeFromCollection,
} from "@/hooks/useCollections";
import IconButton from "@/components/IconButton";
import type { Recipe } from "@/shared/types";

export default function CollectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: collection, isLoading: loadingCollection } = useCollection(id);
  const { data: recipes = [], isLoading: loadingRecipes } = useCollectionRecipes(id);
  const removeFromCollection = useRemoveRecipeFromCollection();
  const deleteCollection = useDeleteCollection();

  if (loadingCollection || !collection) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  const confirmRemove = (recipe: Recipe) => {
    Alert.alert(`Remove from "${collection.name}"?`, recipe.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          removeFromCollection.mutate({ recipeId: recipe.id, collectionId: collection.id }),
      },
    ]);
  };

  const confirmDeleteCollection = () => {
    Alert.alert(
      `Delete "${collection.name}"?`,
      "Recipes inside stay in your cookbook — only the collection goes away.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteCollection.mutateAsync(collection.id);
            router.back();
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Recipe }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/recipe/${item.id}`)}
      activeOpacity={0.8}
    >
      {item.hero_image ? (
        <Image source={{ uri: item.hero_image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Text style={styles.thumbPlaceholderText}>{item.title.slice(0, 1)}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {item.title}
        </Text>
        <View style={styles.rowMeta}>
          <Clock size={12} color="#8A7A6C" />
          <Text style={styles.rowMetaText}>
            {(item.prep_time ?? 0) + (item.cook_time ?? 0)} min
          </Text>
        </View>
      </View>
      <IconButton icon={X} color="#B3574A" onPress={() => confirmRemove(item)} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>
          {collection.emoji} {collection.name}
        </Text>
        <IconButton icon={Trash2} label="Delete" color="#B3574A" onPress={confirmDeleteCollection} />
      </View>
      <FlatList
        data={recipes}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
        ListEmptyComponent={
          !loadingRecipes ? (
            <Text style={styles.emptyText}>
              No recipes here yet. Open a recipe and tap "Save to collection".
            </Text>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF8F0" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    marginBottom: 12,
  },
  header: { fontSize: 22, fontWeight: "800", color: "#2B2118", flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  thumb: { width: 54, height: 54, borderRadius: 10 },
  thumbPlaceholder: { backgroundColor: "#FDE6DD", alignItems: "center", justifyContent: "center" },
  thumbPlaceholderText: { fontSize: 18, fontWeight: "800", color: "#E85D3F" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#2B2118" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  rowMetaText: { fontSize: 12, color: "#8A7A6C" },
  emptyText: { textAlign: "center", color: "#8A7A6C", marginTop: 40 },
});
