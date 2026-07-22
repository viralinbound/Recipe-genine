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
import { Search, Star, Trash2, Clock } from "lucide-react-native";
import { useRecipes, useToggleFavorite, useDeleteRecipe } from "@/hooks/useRecipes";
import type { Recipe } from "@/shared/types";

const FILTERS = ["All", "Favorites", "Breakfast", "Lunch", "Dinner", "Healthy"] as const;

export default function Cookbook() {
  const router = useRouter();
  const { data: recipes = [], isLoading } = useRecipes();
  const toggleFavorite = useToggleFavorite();
  const deleteRecipe = useDeleteRecipe();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const filtered = useMemo(() => {
    let list = recipes;
    if (filter === "Favorites") list = list.filter((r) => r.is_favorite);
    else if (filter === "Healthy") list = list.filter((r) => r.tags?.includes("healthy"));
    else if (filter !== "All")
      list = list.filter((r) =>
        r.tags?.some((t) => t.toLowerCase() === filter.toLowerCase())
      );

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
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/recipe/${item.id}`)}
      onLongPress={() => confirmDelete(item.id)}
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
          {item.cuisine && <Text style={styles.rowMetaText}>· {item.cuisine}</Text>}
        </View>
      </View>
      <TouchableOpacity
        hitSlop={10}
        onPress={() =>
          toggleFavorite.mutate({ id: item.id, is_favorite: !item.is_favorite })
        }
      >
        <Star
          size={20}
          color="#E85D3F"
          fill={item.is_favorite ? "#E85D3F" : "transparent"}
        />
      </TouchableOpacity>
      <TouchableOpacity hitSlop={10} onPress={() => confirmDelete(item.id)}>
        <Trash2 size={18} color="#B3A392" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.header}>Cookbook</Text>
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
        data={FILTERS}
        keyExtractor={(f) => f}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterPill, filter === item && styles.filterPillActive]}
            onPress={() => setFilter(item)}
          >
            <Text style={[styles.filterPillText, filter === item && styles.filterPillTextActive]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.emptyText}>No recipes found.</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  header: { fontSize: 24, fontWeight: "800", color: "#2B2118", paddingHorizontal: 20, paddingTop: 8, marginBottom: 12 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#2B2118" },
  filterRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  filterPill: { backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "#EFE2D6" },
  filterPillActive: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  filterPillText: { fontSize: 13, color: "#2B2118", fontWeight: "500" },
  filterPillTextActive: { color: "#fff" },
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
