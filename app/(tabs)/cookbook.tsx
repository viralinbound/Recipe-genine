import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Search, Star, Trash2, Clock, Plus } from "lucide-react-native";
import { useRecipes, useToggleFavorite, useDeleteRecipe } from "@/hooks/useRecipes";
import { useCollections } from "@/hooks/useCollections";
import CreateCollectionModal from "@/components/CreateCollectionModal";
import IconButton from "@/components/IconButton";
import type { Recipe } from "@/shared/types";

const FILTERS = ["All", "Favorites", "Breakfast", "Lunch", "Dinner", "Healthy"] as const;

export default function Cookbook() {
  const router = useRouter();
  const { data: recipes = [], isLoading } = useRecipes();
  const { data: collections = [] } = useCollections();
  const toggleFavorite = useToggleFavorite();
  const deleteRecipe = useDeleteRecipe();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [showCreateCollection, setShowCreateCollection] = useState(false);

  const filtered = useMemo(() => {
    let list = recipes;

    if (filter === "Favorites") {
      list = list.filter((r) => r.is_favorite);
    } else if (filter !== "All") {
      list = list.filter((r) =>
        r.tags?.some((t) => t.toLowerCase() === filter.toLowerCase())
      );
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q));
    }
    return list;
  }, [recipes, filter, query]);

  const confirmDelete = (id: string) => {
    Alert.alert("Delete recipe?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteRecipe.mutate(id) },
    ]);
  };

  const renderItem = ({ item }: { item: Recipe }) => (
    <View style={styles.row}>
      {/* Tappable Card Area */}
      <TouchableOpacity
        style={styles.rowMain}
        onPress={() => router.push(`/recipe/${item.id}`)}
        onLongPress={() => confirmDelete(item.id)}
        activeOpacity={0.7}
      >
        {item.hero_image ? (
          <Image source={{ uri: item.hero_image }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderText}>{item.title.slice(0, 1)}</Text>
          </View>
        )}
        <View style={styles.rowTextBlock}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {item.title}
          </Text>
          <View style={styles.rowMeta}>
            <Clock size={12} color="#8A7A6C" />
            <Text style={styles.rowMetaText}>
              {(item.prep_time ?? 0) + (item.cook_time ?? 0)} min
            </Text>
            {item.cuisine && <Text style={styles.rowMetaText}>· {item.cuisine}</Text>}
          </View>
        </View>
      </TouchableOpacity>

      {/* Action Buttons Outside Main Card Touch Area */}
      <View style={styles.rowActions}>
        <IconButton
          icon={Star}
          color={item.is_favorite ? "#E85D3F" : "#B3A392"}
          fill={item.is_favorite ? "#E85D3F" : "transparent"}
          onPress={() =>
            toggleFavorite.mutate({ id: item.id, is_favorite: !item.is_favorite })
          }
          style={item.is_favorite ? styles.iconButtonActive : undefined}
        />
        <IconButton
          icon={Trash2}
          color="#B3574A"
          onPress={() => confirmDelete(item.id)}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        style={{ flex: 1 }}
        data={filtered}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
        ListHeaderComponent={
          <>
            <Text style={styles.header}>Cookbook</Text>

            <Text style={styles.subsectionTitle}>Collections</Text>
            <FlatList
              horizontal
              removeClippedSubviews={false}
              data={collections}
              keyExtractor={(c) => c.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.collectionsRow}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.collectionChip}
                  onPress={() => router.push(`/collection/${item.id}`)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.collectionChipEmoji}>{item.emoji}</Text>
                  <Text
                    style={styles.collectionChipText}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.collectionsEmptyText}>No collections yet</Text>
              }
              ListFooterComponent={
                <TouchableOpacity
                  style={styles.newCollectionChip}
                  onPress={() => setShowCreateCollection(true)}
                  activeOpacity={0.75}
                >
                  <Plus size={14} color="#E85D3F" />
                  <Text style={styles.newCollectionChipText}>New</Text>
                </TouchableOpacity>
              }
            />

            <View style={styles.searchWrap}>
              <Search size={18} color="#A9998A" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search recipes"
                placeholderTextColor="#A9998A"
                value={query}
                onChangeText={setQuery}
              />
            </View>

            <FlatList
              horizontal
              removeClippedSubviews={false}
              data={FILTERS}
              keyExtractor={(f) => f}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    filter === item && styles.filterPillActive,
                  ]}
                  onPress={() => setFilter(item)}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      filter === item && styles.filterPillTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.emptyText}>No recipes found.</Text>
          ) : undefined
        }
      />

      <CreateCollectionModal
        visible={showCreateCollection}
        onClose={() => setShowCreateCollection(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  header: { fontSize: 24, fontWeight: "800", color: "#2B2118", paddingTop: 8, marginBottom: 12 },
  subsectionTitle: { fontSize: 13, fontWeight: "700", color: "#8A7A6C", marginBottom: 8 },

  /* Collections Styles */
  collectionsRow: { gap: 8, paddingBottom: 16, alignItems: "center" },
  collectionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 160,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  collectionChipEmoji: { fontSize: 15 },
  collectionChipText: { fontSize: 13, color: "#2B2118", fontWeight: "600", lineHeight: 18, flexShrink: 1 },
  collectionsEmptyText: { fontSize: 13, color: "#A9998A", fontStyle: "italic", paddingVertical: 10 },
  newCollectionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    backgroundColor: "#FDE6DD",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#F3B4A1",
  },
  newCollectionChipText: { fontSize: 13, color: "#E85D3F", fontWeight: "700", lineHeight: 18 },

  /* Search & Filter Styles */
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#2B2118" },
  filterRow: { gap: 8, paddingBottom: 16, alignItems: "center" },
  filterPill: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    justifyContent: "center",
    alignItems: "center",
  },
  filterPillActive: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  filterPillText: { fontSize: 13, color: "#2B2118", fontWeight: "600", lineHeight: 18, textAlign: "center" },
  filterPillTextActive: { color: "#fff" },

  /* Card Item Styles */
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  thumb: { width: 54, height: 54, borderRadius: 10, flexShrink: 0 },
  thumbPlaceholder: { backgroundColor: "#FDE6DD", alignItems: "center", justifyContent: "center" },
  thumbPlaceholderText: { fontSize: 18, fontWeight: "800", color: "#E85D3F" },
  rowTextBlock: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#2B2118" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  rowMetaText: { fontSize: 12, color: "#8A7A6C" },
  iconButtonActive: { backgroundColor: "#FDE6DD" },
  emptyText: { textAlign: "center", color: "#8A7A6C", marginTop: 40 },
});