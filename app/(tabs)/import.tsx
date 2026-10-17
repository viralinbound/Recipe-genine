import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Link2, CheckCircle2, Circle, Sparkles } from "lucide-react-native";
import { useImportRecipe } from "@/hooks/useImport";
import { useToggleFavorite, useUpdateRecipeTags } from "@/hooks/useRecipes";
import {
  COOKBOOK_SAVE_OPTIONS,
  cookbookSavesFromTags,
  suggestCookbookSaves,
  type CookbookSaveOption,
} from "@/shared/categories";
import type { Recipe } from "@/shared/types";

const STEPS = [
  "Analyzing link source",
  "Reading full video content",
  "Generating your recipe",
  "Almost done…",
];

export default function Import() {
  const router = useRouter();
  const importRecipe = useImportRecipe();
  const updateTags = useUpdateRecipeTags();
  const toggleFavorite = useToggleFavorite();
  const [url, setUrl] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // After generation: ask where to save
  const [pendingRecipe, setPendingRecipe] = useState<Recipe | null>(null);
  const [saveChoices, setSaveChoices] = useState<CookbookSaveOption[]>([]);
  const [suggested, setSuggested] = useState<CookbookSaveOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startFakeProgress = () => {
    setStepIndex(0);
    timerRef.current = setInterval(() => {
      setStepIndex((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 1800);
  };

  const stopFakeProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const openSavePicker = (recipe: Recipe, linkText: string) => {
    const fromLink = suggestCookbookSaves(`${linkText} ${recipe.title} ${recipe.description ?? ""}`);
    const fromTags = cookbookSavesFromTags(recipe.tags);
    const auto = Array.from(new Set([...fromLink, ...fromTags])) as CookbookSaveOption[];
    // Prefer meal categories; default Dinner if nothing detected
    const starter =
      auto.length > 0
        ? auto
        : (["Dinner"] as CookbookSaveOption[]);
    setSuggested(auto);
    setSaveChoices(starter);
    setPendingRecipe(recipe);
  };

  const toggleSave = (opt: CookbookSaveOption) => {
    setSaveChoices((prev) =>
      prev.includes(opt) ? prev.filter((c) => c !== opt) : [...prev, opt]
    );
  };

  const handleImport = async () => {
    let targetUrl = url.trim();
    if (!targetUrl) {
      Alert.alert("Missing link", "Paste a recipe or video link first.");
      return;
    }

    const extractedMatch = targetUrl.match(/(https?:\/\/[^\s]+)/i);
    if (extractedMatch) {
      targetUrl = extractedMatch[1];
    } else if (!/^https?:\/\//i.test(targetUrl)) {
      Alert.alert("Invalid link", "That doesn't look like a valid URL.");
      return;
    }

    startFakeProgress();
    try {
      const recipe = await importRecipe.mutateAsync(targetUrl);
      stopFakeProgress();
      openSavePicker(recipe, `${targetUrl} ${recipe.title}`);
    } catch (e: any) {
      stopFakeProgress();
      const message =
        e.message?.includes("no_recipe") || e.message?.includes("not a recipe")
          ? "Could not find recipe details in this video or link. Try another food video link!"
          : e.message || "Something went wrong importing this recipe.";
      Alert.alert("Import failed", message);
    }
  };

  const confirmSave = async () => {
    if (!pendingRecipe) return;
    let destinations = saveChoices;
    if (destinations.length === 0) {
      destinations = suggested.length > 0 ? suggested : ["Dinner"];
    }

    const tagDestinations = destinations.filter((d) => d !== "Favorites");
    const markFavorite = destinations.includes("Favorites");

    setSaving(true);
    try {
      const fromAi = cookbookSavesFromTags(pendingRecipe.tags);
      const finalTags = Array.from(
        new Set(
          [...(pendingRecipe.tags ?? []), ...tagDestinations, ...fromAi]
            .map((t) => t.trim())
            .filter(Boolean)
        )
      );

      await updateTags.mutateAsync({ id: pendingRecipe.id, tags: finalTags });

      if (markFavorite) {
        await toggleFavorite.mutateAsync({ id: pendingRecipe.id, is_favorite: true });
      }

      const id = pendingRecipe.id;
      setPendingRecipe(null);
      setUrl("");
      setSaveChoices([]);
      setSuggested([]);
      router.push(`/recipe/${id}`);
    } catch (e: any) {
      Alert.alert("Couldn't save categories", e.message || "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const busy = importRecipe.isPending || saving;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.header}>Add a recipe</Text>
          <Text style={styles.subheader}>
            Paste a food video link. After generation we'll ask where to save it in your Cookbook.
          </Text>

          <Text style={styles.sectionLabel}>Recipe link</Text>
          <View style={styles.inputWrap}>
            <Link2 size={18} color="#A9998A" />
            <TextInput
              style={styles.input}
              placeholder="Paste YouTube, Reel, TikTok, or blog link..."
              placeholderTextColor="#A9998A"
              autoCapitalize="none"
              autoCorrect={false}
              value={url}
              onChangeText={setUrl}
              editable={!busy}
              multiline
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={handleImport}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, busy && { opacity: 0.6 }]}
            onPress={handleImport}
            disabled={busy}
          >
            <Text style={styles.buttonText}>
              {importRecipe.isPending ? "Generating..." : "Generate recipe"}
            </Text>
          </TouchableOpacity>

          {importRecipe.isPending && (
            <View style={styles.progressCard}>
              {STEPS.map((step, i) => (
                <View key={step} style={styles.progressRow}>
                  {i < stepIndex ? (
                    <CheckCircle2 size={20} color="#4CAF6D" />
                  ) : i === stepIndex ? (
                    <CheckCircle2 size={20} color="#E85D3F" />
                  ) : (
                    <Circle size={20} color="#D8C9BB" />
                  )}
                  <Text
                    style={[
                      styles.progressText,
                      i <= stepIndex && styles.progressTextActive,
                    ]}
                  >
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.hintBox}>
            <Text style={styles.hintTitle}>Then save to Cookbook</Text>
            <Text style={styles.hintText}>
              After the recipe is generated, pick Favorites / Breakfast / Lunch / Dinner / Healthy.
              We auto-suggest — change it if you want. Saved to your database tags.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={!!pendingRecipe}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingRecipe(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Where do you want to save this?</Text>
            <Text style={styles.sheetRecipe} numberOfLines={2}>
              {pendingRecipe?.title}
            </Text>
            <Text style={styles.sheetHint}>
              Same as Cookbook filters. Auto-suggested — change if you like.
            </Text>

            {suggested.length > 0 && (
              <View style={styles.suggestBanner}>
                <Sparkles size={16} color="#B7482E" />
                <Text style={styles.suggestBannerText}>
                  Suggested: {suggested.join(", ")}
                </Text>
              </View>
            )}

            <View style={styles.chipWrap}>
              {COOKBOOK_SAVE_OPTIONS.map((opt) => {
                const on = saveChoices.includes(opt);
                const isSuggested = suggested.includes(opt);
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.chip,
                      isSuggested && !on && styles.chipSuggested,
                      on && styles.chipOn,
                    ]}
                    onPress={() => toggleSave(opt)}
                    disabled={saving}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.button, saving && { opacity: 0.6 }]}
              onPress={confirmSave}
              disabled={saving}
            >
              <Text style={styles.buttonText}>
                {saving ? "Saving..." : "Save to Cookbook"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              disabled={saving}
              onPress={() => {
                const id = pendingRecipe?.id;
                setPendingRecipe(null);
                setUrl("");
                if (id) router.push(`/recipe/${id}`);
              }}
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  flex: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { fontSize: 24, fontWeight: "800", color: "#2B2118", marginTop: 4 },
  subheader: { fontSize: 14, color: "#8A7A6C", marginTop: 6, marginBottom: 18 },
  sectionLabel: { fontSize: 15, fontWeight: "700", color: "#2B2118", marginBottom: 8 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    marginBottom: 16,
  },
  input: { flex: 1, fontSize: 15, color: "#2B2118", minHeight: 24 },
  button: { backgroundColor: "#E85D3F", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  progressCard: {
    marginTop: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressText: { fontSize: 14, color: "#B3A392" },
  progressTextActive: { color: "#2B2118", fontWeight: "500" },
  hintBox: { marginTop: 24, backgroundColor: "#FDE6DD", borderRadius: 14, padding: 16 },
  hintTitle: { fontSize: 13, fontWeight: "700", color: "#B7482E", marginBottom: 4 },
  hintText: { fontSize: 12, color: "#8A6558", lineHeight: 18 },
  backdrop: { flex: 1, backgroundColor: "rgba(43,33,24,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#FFF8F0",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: "#2B2118" },
  sheetRecipe: { fontSize: 15, fontWeight: "600", color: "#E85D3F", marginTop: 8 },
  sheetHint: { fontSize: 13, color: "#8A7A6C", marginTop: 6, marginBottom: 14, lineHeight: 18 },
  suggestBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FDE6DD",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  suggestBannerText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#B7482E" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  chipSuggested: { borderColor: "#E85D3F", backgroundColor: "#FFF1EC" },
  chipOn: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#8A7A6C" },
  chipTextOn: { color: "#fff" },
  skipBtn: { alignItems: "center", marginTop: 14 },
  skipText: { fontSize: 14, color: "#8A7A6C", fontWeight: "600" },
});
