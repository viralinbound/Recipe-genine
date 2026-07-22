import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Search, Link2, Star, Clock, Sparkles, CalendarDays } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { useRecipes } from "@/hooks/useRecipes";
import type { Recipe } from "@/shared/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value]);
  return debounced;
}

export default function Home() {
  const router = useRouter();
  const { profile } = useAuth();
  const { data: recipes = [], isLoading } = useRecipes();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);

  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase();
    return recipes.filter(
      (r) => r.title.toLowerCase().includes(q) || r.cuisine?.toLowerCase().includes(q)
    );
  }, [debouncedQuery, recipes]);

  const cuisines = useMemo(() => {
    const set = new Set<string>();
    recipes.forEach((r) => r.cuisine && set.add(r.cuisine));
    return Array.from(set).slice(0, 8);
  }, [recipes]);

  const favorites = recipes.filter((r) => r.is_favorite);
  const quickMeals = recipes.filter(
    (r) => (r.prep_time ?? 0) + (r.cook_time ?? 0) <= 25 && (r.prep_time || r.cook_time)
  );
  const recent = recipes.slice(0, 10);

  const RecipeCard = ({ item }: { item: Recipe }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/recipe/${item.id}`)}
      activeOpacity={0.85}
    >
      {item.hero_image ? (
        <Image source={{ uri: item.hero_image }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardPlaceholder]}>
          <Text style={styles.cardPlaceholderText}>{item.title.slice(0, 1)}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {item.title}
        </Text>
        <View style={styles.cardMetaRow}>
          <Clock size={12} color="#8A7A6C" />
          <Text style={styles.cardMeta}>
            {(item.prep_time ?? 0) + (item.cook_time ?? 0)} min
          </Text>
          {!!item.servings && <Text style={styles.cardMeta}>· {item.servings} servings</Text>}
        </View>
      </View>
      {item.is_favorite && (
        <View style={styles.favBadge}>
          <Star size={14} color="#E85D3F" fill="#E85D3F" />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {greeting()}, {profile?.display_name?.split(" ")[0] || "chef"}!
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <Search size={18} color="#A9998A" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your cookbook"
            placeholderTextColor="#A9998A"
            value={query}
            onChangeText={setQuery}
          />
        </View>

        {debouncedQuery.trim() ? (
          <View style={{ paddingHorizontal: 20 }}>
            {searchResults.length === 0 ? (
              <Text style={styles.emptyText}>No matches for "{debouncedQuery}"</Text>
            ) : (
              searchResults.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.searchRow}
                  onPress={() => router.push(`/recipe/${r.id}`)}
                >
                  <Text style={styles.searchRowText}>{r.title}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : (
          <>
            {recipes.length === 0 ? (
              <TouchableOpacity
                style={styles.importCardEmpty}
                onPress={() => router.push("/(tabs)/import")}
              >
                <Link2 size={28} color="#E85D3F" />
                <Text style={styles.importCardEmptyTitle}>Paste your first recipe link</Text>
                <Text style={styles.importCardEmptySub}>
                  YouTube, Instagram, or any food blog
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.importBarCompact}
                onPress={() => router.push("/(tabs)/import")}
              >
                <Link2 size={16} color="#E85D3F" />
                <Text style={styles.importBarCompactText}>Paste a link to add a recipe</Text>
              </TouchableOpacity>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{recipes.length}</Text>
                <Text style={styles.statLabel}>Saved</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{favorites.length}</Text>
                <Text style={styles.statLabel}>Favorites</Text>
              </View>
            </View>

            {cuisines.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsRow}
              >
                {cuisines.map((c) => (
                  <View key={c} style={styles.pill}>
                    <Text style={styles.pillText}>{c}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.aiRow}>
              <TouchableOpacity
                style={styles.aiCta}
                onPress={() => router.push("/(tabs)/mealplan")}
              >
                <CalendarDays size={20} color="#fff" />
                <Text style={styles.aiCtaText}>Plan your week</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.aiCta, styles.aiCtaAlt]}
                onPress={() => router.push("/(tabs)/cookbook")}
              >
                <Sparkles size={20} color="#E85D3F" />
                <Text style={[styles.aiCtaText, styles.aiCtaAltText]}>Make it healthy</Text>
              </TouchableOpacity>
            </View>

            {recent.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Recently added</Text>
                <FlatList
                  data={recent}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(i) => i.id}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                  renderItem={RecipeCard}
                />
              </>
            )}

            {favorites.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Favorites</Text>
                <FlatList
                  data={favorites}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(i) => i.id}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                  renderItem={RecipeCard}
                />
              </>
            )}

            {quickMeals.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Quick meals (under 25 min)</Text>
                <FlatList
                  data={quickMeals}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(i) => i.id}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                  renderItem={RecipeCard}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  greeting: { fontSize: 22, fontWeight: "700", color: "#2B2118" },
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
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#2B2118" },
  emptyText: { color: "#8A7A6C", textAlign: "center", marginTop: 20 },
  searchRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EFE2D6" },
  searchRowText: { fontSize: 15, color: "#2B2118" },
  importCardEmpty: {
    marginHorizontal: 20,
    backgroundColor: "#FDE6DD",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  importCardEmptyTitle: { fontSize: 17, fontWeight: "700", color: "#2B2118", marginTop: 10 },
  importCardEmptySub: { fontSize: 13, color: "#8A7A6C", marginTop: 4 },
  importBarCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    backgroundColor: "#FDE6DD",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  importBarCompactText: { color: "#B7482E", fontWeight: "600", fontSize: 14 },
  statsRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  statNumber: { fontSize: 22, fontWeight: "800", color: "#2B2118" },
  statLabel: { fontSize: 12, color: "#8A7A6C", marginTop: 2 },
  pillsRow: { paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  pill: { backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "#EFE2D6" },
  pillText: { fontSize: 13, color: "#2B2118", fontWeight: "500" },
  aiRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 20 },
  aiCta: {
    flex: 1,
    backgroundColor: "#E85D3F",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  aiCtaAlt: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E85D3F" },
  aiCtaText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  aiCtaAltText: { color: "#E85D3F" },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#2B2118", paddingHorizontal: 20, marginBottom: 10, marginTop: 4 },
  card: { width: 160, backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#EFE2D6" },
  cardImage: { width: "100%", height: 100 },
  cardPlaceholder: { backgroundColor: "#FDE6DD", alignItems: "center", justifyContent: "center" },
  cardPlaceholderText: { fontSize: 28, fontWeight: "800", color: "#E85D3F" },
  cardBody: { padding: 10 },
  cardTitle: { fontSize: 13, fontWeight: "600", color: "#2B2118", minHeight: 34 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  cardMeta: { fontSize: 11, color: "#8A7A6C" },
  favBadge: { position: "absolute", top: 8, right: 8, backgroundColor: "#fff", borderRadius: 12, padding: 4 },
});
