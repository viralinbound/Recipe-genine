import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Clock, Users, BarChart3, Sparkles, Youtube, Instagram, Globe, AlarmClock, FolderPlus, Plus } from "lucide-react-native";
import { useRecipe } from "@/hooks/useRecipes";
import { useMakeHealthy } from "@/hooks/useImport";
import {
  useCollections,
  useRecipeCollectionIds,
  useAddRecipeToCollection,
  useRemoveRecipeFromCollection,
} from "@/hooks/useCollections";
import CreateCollectionModal from "@/components/CreateCollectionModal";
import type { Collection } from "@/shared/types";

const SOURCE_ICON: Record<string, any> = {
  youtube: Youtube,
  instagram: Instagram,
  blog: Globe,
};

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: recipe, isLoading } = useRecipe(id);
  const makeHealthy = useMakeHealthy();
  const [checkedIngredients, setCheckedIngredients] = useState<Record<number, boolean>>({});
  const [healthyResult, setHealthyResult] = useState<{
    calorie_reduction_percent: number;
    health_benefits: string[];
  } | null>(null);
  const [showCollectionsModal, setShowCollectionsModal] = useState(false);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const { data: collections = [] } = useCollections();
  const { data: memberCollectionIds = [] } = useRecipeCollectionIds(recipe?.id);
  const addToCollection = useAddRecipeToCollection();
  const removeFromCollection = useRemoveRecipeFromCollection();

  if (isLoading || !recipe) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  const SourceIcon = recipe.source_type ? SOURCE_ICON[recipe.source_type] : null;

  const toggleCollection = (collectionId: string) => {
    if (memberCollectionIds.includes(collectionId)) {
      removeFromCollection.mutate({ recipeId: recipe.id, collectionId });
    } else {
      addToCollection.mutate({ recipeId: recipe.id, collectionId });
    }
  };

  const handleMakeHealthy = async () => {
    try {
      const result = await makeHealthy.mutateAsync(recipe.id);
      setHealthyResult({
        calorie_reduction_percent: result.calorie_reduction_percent,
        health_benefits: result.health_benefits,
      });
      Alert.alert(
        "Healthy version created!",
        `Saved a new recipe with ~${result.calorie_reduction_percent}% fewer calories.`,
        [
          {
            text: "View it",
            onPress: () => {
              if (result.recipe?.id) router.push(`/recipe/${result.recipe.id}`);
            },
          },
          { text: "OK" },
        ]
      );
    } catch (e: any) {
      Alert.alert("Couldn't create healthy version", e.message || "Try again.");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {recipe.hero_image ? (
        <Image source={{ uri: recipe.hero_image }} style={styles.hero} />
      ) : (
        <View style={[styles.hero, styles.heroPlaceholder]}>
          <Text style={styles.heroPlaceholderText}>{recipe.title.slice(0, 1)}</Text>
        </View>
      )}

      <View style={styles.body}>
        {recipe.source_type && SourceIcon && (
          <View style={styles.sourceBadge}>
            <SourceIcon size={13} color="#8A7A6C" />
            <Text style={styles.sourceBadgeText}>{recipe.source_type}</Text>
          </View>
        )}

        <Text style={styles.title}>{recipe.title}</Text>
        {recipe.description && <Text style={styles.description}>{recipe.description}</Text>}

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Clock size={16} color="#8A7A6C" />
            <Text style={styles.statText}>
              {(recipe.prep_time ?? 0)} + {(recipe.cook_time ?? 0)} min
            </Text>
          </View>
          <View style={styles.statItem}>
            <Users size={16} color="#8A7A6C" />
            <Text style={styles.statText}>{recipe.servings ?? "-"} servings</Text>
          </View>
          {recipe.difficulty && (
            <View style={styles.statItem}>
              <BarChart3 size={16} color="#8A7A6C" />
              <Text style={styles.statText}>{recipe.difficulty}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Ingredients</Text>
        <View style={styles.card}>
          {recipe.ingredients.map((ing, i) => (
            <TouchableOpacity
              key={i}
              style={styles.ingredientRow}
              onPress={() => setCheckedIngredients((c) => ({ ...c, [i]: !c[i] }))}
            >
              <View style={[styles.checkbox, checkedIngredients[i] && styles.checkboxChecked]} />
              <Text
                style={[
                  styles.ingredientText,
                  checkedIngredients[i] && styles.ingredientTextChecked,
                ]}
              >
                {(() => {
                  const measure = [ing.amount ?? ing.quantity, ing.unit]
                    .filter(Boolean)
                    .join(" ");
                  return measure ? `${measure} ` : "";
                })()}
                {ing.item}
                {ing.notes ? ` (${ing.notes})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Instructions</Text>
        <View style={styles.card}>
          {recipe.instructions.map((step) => (
            <View key={step.step} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{step.step}</Text>
              </View>
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>

        {recipe.chef_notes && (
          <>
            <Text style={styles.sectionTitle}>Chef's notes</Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>{recipe.chef_notes}</Text>
            </View>
          </>
        )}

        <TouchableOpacity
          style={styles.scheduleButton}
          onPress={() => router.push(`/schedule/${recipe.id}`)}
        >
          <AlarmClock size={18} color="#E85D3F" />
          <Text style={styles.scheduleButtonText}>Schedule this meal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.scheduleButton}
          onPress={() => setShowCollectionsModal(true)}
        >
          <FolderPlus size={18} color="#E85D3F" />
          <Text style={styles.scheduleButtonText}>
            {memberCollectionIds.length > 0
              ? `Saved to ${memberCollectionIds.length} collection${memberCollectionIds.length > 1 ? "s" : ""}`
              : "Save to collection"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.healthyButton, makeHealthy.isPending && { opacity: 0.6 }]}
          onPress={handleMakeHealthy}
          disabled={makeHealthy.isPending}
        >
          <Sparkles size={18} color="#fff" />
          <Text style={styles.healthyButtonText}>
            {makeHealthy.isPending ? "Working on it..." : "Make it Healthy"}
          </Text>
        </TouchableOpacity>

        {healthyResult && (
          <View style={styles.healthyResultBox}>
            <Text style={styles.healthyResultTitle}>
              ~{healthyResult.calorie_reduction_percent}% fewer calories
            </Text>
            {healthyResult.health_benefits.map((b, i) => (
              <Text key={i} style={styles.healthyResultText}>
                · {b}
              </Text>
            ))}
          </View>
        )}
      </View>

      <Modal
        visible={showCollectionsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCollectionsModal(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Save to collection</Text>
            {collections.length === 0 && (
              <Text style={styles.sheetEmpty}>You don't have any collections yet.</Text>
            )}
            <ScrollView style={{ maxHeight: 280 }}>
              {collections.map((c: Collection) => {
                const active = memberCollectionIds.includes(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.collectionOption}
                    onPress={() => toggleCollection(c.id)}
                  >
                    <Text style={styles.collectionOptionText}>
                      {c.emoji} {c.name}
                    </Text>
                    <View style={[styles.checkbox, active && styles.checkboxChecked]} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.newCollectionRow}
              onPress={() => {
                setShowCollectionsModal(false);
                setShowCreateCollection(true);
              }}
            >
              <Plus size={16} color="#E85D3F" />
              <Text style={styles.newCollectionRowText}>New collection</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setShowCollectionsModal(false)}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CreateCollectionModal
        visible={showCreateCollection}
        onClose={() => setShowCreateCollection(false)}
        onCreated={(c) => {
          addToCollection.mutate({ recipeId: recipe.id, collectionId: c.id });
          setShowCollectionsModal(true);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF8F0" },
  hero: { width: "100%", height: 240 },
  heroPlaceholder: { backgroundColor: "#FDE6DD", alignItems: "center", justifyContent: "center" },
  heroPlaceholderText: { fontSize: 56, fontWeight: "800", color: "#E85D3F" },
  body: { padding: 20 },
  sourceBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "#F5EBE0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  sourceBadgeText: { fontSize: 11, color: "#8A7A6C", textTransform: "capitalize" },
  title: { fontSize: 24, fontWeight: "800", color: "#2B2118", marginBottom: 8 },
  description: { fontSize: 14, color: "#6B5D50", lineHeight: 20, marginBottom: 16 },
  statsRow: { flexDirection: "row", gap: 20, marginBottom: 24 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { fontSize: 13, color: "#8A7A6C", textTransform: "capitalize" },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#2B2118", marginBottom: 10, marginTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#EFE2D6", marginBottom: 20, gap: 14 },
  ingredientRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: "#D8C9BB" },
  checkboxChecked: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  ingredientText: { fontSize: 14, color: "#2B2118", flex: 1 },
  ingredientTextChecked: { color: "#B3A392", textDecorationLine: "line-through" },
  stepRow: { flexDirection: "row", gap: 12 },
  stepNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FDE6DD", alignItems: "center", justifyContent: "center" },
  stepNumberText: { fontSize: 12, fontWeight: "700", color: "#E85D3F" },
  stepText: { fontSize: 14, color: "#2B2118", flex: 1, lineHeight: 20, paddingTop: 3 },
  notesBox: { backgroundColor: "#FDE6DD", borderRadius: 14, padding: 16, marginBottom: 20 },
  notesText: { fontSize: 13, color: "#8A6558", lineHeight: 20 },
  scheduleButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E85D3F", borderRadius: 14, paddingVertical: 14, marginBottom: 12 },
  scheduleButtonText: { color: "#E85D3F", fontWeight: "700", fontSize: 15 },
  healthyButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#4CAF6D", borderRadius: 14, paddingVertical: 15, marginBottom: 12 },
  healthyButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  healthyResultBox: { backgroundColor: "#EAF6ED", borderRadius: 14, padding: 16 },
  healthyResultTitle: { fontSize: 14, fontWeight: "700", color: "#2E7D4F", marginBottom: 6 },
  healthyResultText: { fontSize: 13, color: "#3F6B4F", lineHeight: 20 },
  backdrop: { flex: 1, backgroundColor: "rgba(43,33,24,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFF8F0", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#2B2118", marginBottom: 16 },
  sheetEmpty: { fontSize: 13, color: "#8A7A6C", marginBottom: 16 },
  collectionOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE2D6",
  },
  collectionOptionText: { fontSize: 15, color: "#2B2118", fontWeight: "500" },
  newCollectionRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14 },
  newCollectionRowText: { fontSize: 14, color: "#E85D3F", fontWeight: "700" },
  doneButton: { backgroundColor: "#E85D3F", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  doneButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
