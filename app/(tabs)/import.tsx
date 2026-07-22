import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Link2, CheckCircle2, Circle } from "lucide-react-native";
import { useImportRecipe } from "@/hooks/useImport";

const STEPS = [
  "Fetching the page",
  "Reading the recipe",
  "Extracting ingredients & steps",
  "Saving to your cookbook",
];

export default function Import() {
  const router = useRouter();
  const importRecipe = useImportRecipe();
  const [url, setUrl] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startFakeProgress = () => {
    setStepIndex(0);
    timerRef.current = setInterval(() => {
      setStepIndex((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 1400);
  };

  const stopFakeProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert("Missing link", "Paste a recipe URL first.");
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      Alert.alert("Invalid link", "That doesn't look like a valid URL.");
      return;
    }

    startFakeProgress();
    try {
      const recipe = await importRecipe.mutateAsync(trimmed);
      stopFakeProgress();
      setUrl("");
      router.push(`/recipe/${recipe.id}`);
    } catch (e: any) {
      stopFakeProgress();
      const message =
        e.message?.includes("no_recipe") || e.message?.includes("not a recipe")
          ? "This doesn't look like a recipe page. Try a different link."
          : e.message || "Something went wrong importing this recipe.";
      Alert.alert("Import failed", message);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.header}>Add a recipe</Text>
      <Text style={styles.subheader}>
        Works with YouTube, Instagram, and most food blogs.
      </Text>

      <View style={styles.inputWrap}>
        <Link2 size={18} color="#A9998A" />
        <TextInput
          style={styles.input}
          placeholder="Paste a recipe link..."
          placeholderTextColor="#A9998A"
          autoCapitalize="none"
          autoCorrect={false}
          value={url}
          onChangeText={setUrl}
          editable={!importRecipe.isPending}
          multiline
        />
      </View>

      <TouchableOpacity
        style={[styles.button, importRecipe.isPending && { opacity: 0.6 }]}
        onPress={handleImport}
        disabled={importRecipe.isPending}
      >
        <Text style={styles.buttonText}>
          {importRecipe.isPending ? "Importing..." : "Import recipe"}
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
        <Text style={styles.hintTitle}>Supported sources</Text>
        <Text style={styles.hintText}>
          YouTube · Instagram · AllRecipes · Bon Appétit · Serious Eats · NYT Cooking · most
          other food blogs
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0", padding: 20 },
  header: { fontSize: 24, fontWeight: "800", color: "#2B2118", marginTop: 4 },
  subheader: { fontSize: 14, color: "#8A7A6C", marginTop: 6, marginBottom: 20 },
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
});
