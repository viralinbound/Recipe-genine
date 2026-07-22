import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronDown, ChevronUp, ShoppingCart, Sparkles } from "lucide-react-native";
import { useMealPlanner } from "@/hooks/useImport";
import type { MealPlan } from "@/shared/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MealPlanScreen() {
  const mealPlanner = useMealPlanner();
  const [makeHealthy, setMakeHealthy] = useState(false);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const generate = async () => {
    try {
      const result = await mealPlanner.mutateAsync(makeHealthy);
      setPlan(result);
      setSelectedDay(0);
      setChecked({});
    } catch (e: any) {
      Alert.alert("Couldn't generate plan", e.message || "Try again in a moment.");
    }
  };

  const dayPlan = plan?.days[selectedDay];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.header}>Meal planner</Text>
        <Text style={styles.subheader}>
          A 7-day plan built from your saved recipes.
        </Text>

        <View style={styles.toggleRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Sparkles size={18} color="#E85D3F" />
            <Text style={styles.toggleLabel}>Make it healthy</Text>
          </View>
          <Switch
            value={makeHealthy}
            onValueChange={setMakeHealthy}
            trackColor={{ false: "#EFE2D6", true: "#F3B4A1" }}
            thumbColor={makeHealthy ? "#E85D3F" : "#fff"}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, mealPlanner.isPending && { opacity: 0.6 }]}
          onPress={generate}
          disabled={mealPlanner.isPending}
        >
          <Text style={styles.buttonText}>
            {mealPlanner.isPending
              ? "Generating..."
              : plan
              ? makeHealthy
                ? "Regenerate as healthy"
                : "Regenerate plan"
              : "Generate meal plan"}
          </Text>
        </TouchableOpacity>

        {plan && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayRow}
            >
              {DAYS.map((d, i) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayPill, selectedDay === i && styles.dayPillActive]}
                  onPress={() => setSelectedDay(i)}
                >
                  <Text style={[styles.dayPillText, selectedDay === i && styles.dayPillTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.mealsCard}>
              {dayPlan?.meals.map((m) => (
                <View key={m.meal} style={styles.mealRow}>
                  <Text style={styles.mealSlot}>{m.meal}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealTitle}>{m.recipe_title}</Text>
                    <Text style={styles.mealNote}>{m.quick_prep_note}</Text>
                  </View>
                </View>
              ))}
            </View>

            {plan.prep_tips?.length > 0 && (
              <View style={styles.tipsBox}>
                <Text style={styles.tipsTitle}>Prep tips</Text>
                {plan.prep_tips.map((tip, i) => (
                  <Text key={i} style={styles.tipText}>
                    · {tip}
                  </Text>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.shoppingHeader}
              onPress={() => setShoppingOpen((o) => !o)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ShoppingCart size={18} color="#2B2118" />
                <Text style={styles.shoppingHeaderText}>Shopping list</Text>
              </View>
              {shoppingOpen ? (
                <ChevronUp size={18} color="#2B2118" />
              ) : (
                <ChevronDown size={18} color="#2B2118" />
              )}
            </TouchableOpacity>

            {shoppingOpen && (
              <View style={styles.shoppingList}>
                {plan.shopping_list.map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.shoppingItem}
                    onPress={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
                  >
                    <View style={[styles.checkbox, checked[i] && styles.checkboxChecked]} />
                    <Text
                      style={[
                        styles.shoppingItemText,
                        checked[i] && styles.shoppingItemTextChecked,
                      ]}
                    >
                      {item.item}
                      {item.quantity ? ` — ${item.quantity}` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  header: { fontSize: 24, fontWeight: "800", color: "#2B2118" },
  subheader: { fontSize: 14, color: "#8A7A6C", marginTop: 6, marginBottom: 20 },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  toggleLabel: { fontSize: 15, fontWeight: "500", color: "#2B2118" },
  button: { backgroundColor: "#E85D3F", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginBottom: 20 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  dayRow: { gap: 8, marginBottom: 16 },
  dayPill: { backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: "#EFE2D6" },
  dayPillActive: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  dayPillText: { fontSize: 13, fontWeight: "600", color: "#2B2118" },
  dayPillTextActive: { color: "#fff" },
  mealsCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: "#EFE2D6", marginBottom: 16 },
  mealRow: { flexDirection: "row", gap: 12 },
  mealSlot: { width: 76, fontSize: 12, fontWeight: "700", color: "#E85D3F", paddingTop: 2 },
  mealTitle: { fontSize: 15, fontWeight: "600", color: "#2B2118" },
  mealNote: { fontSize: 12, color: "#8A7A6C", marginTop: 2 },
  tipsBox: { backgroundColor: "#FDE6DD", borderRadius: 14, padding: 16, marginBottom: 16 },
  tipsTitle: { fontSize: 13, fontWeight: "700", color: "#B7482E", marginBottom: 6 },
  tipText: { fontSize: 13, color: "#8A6558", lineHeight: 20 },
  shoppingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  shoppingHeaderText: { fontSize: 15, fontWeight: "600", color: "#2B2118" },
  shoppingList: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 8, gap: 12, borderWidth: 1, borderColor: "#EFE2D6" },
  shoppingItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: "#D8C9BB" },
  checkboxChecked: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  shoppingItemText: { fontSize: 14, color: "#2B2118" },
  shoppingItemTextChecked: { color: "#B3A392", textDecorationLine: "line-through" },
});
