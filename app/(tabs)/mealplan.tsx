import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp, ShoppingCart, Sparkles, CalendarDays, AlarmClock, Clock, BookOpen, Check } from "lucide-react-native";
import { useMealPlanner } from "@/hooks/useImport";
import { useRecipes } from "@/hooks/useRecipes";
import { useScheduleMeal } from "@/hooks/useScheduledMeals";
import IconButton from "@/components/IconButton";
import type { MealPlan, MealSlot, Recipe } from "@/shared/types";

const MEAL_SLOTS: MealSlot["meal"][] = ["Breakfast", "Lunch", "Snack", "Dinner"];

const DEFAULT_MEAL_TIMES: Record<MealSlot["meal"], { hour: number; minute: number }> = {
  Breakfast: { hour: 8, minute: 0 },
  Lunch: { hour: 13, minute: 0 },
  Snack: { hour: 16, minute: 0 },
  Dinner: { hour: 19, minute: 30 },
};

function timeAt(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Builds the 7 calendar dates for the plan, starting from whichever date the
// user picked (the AI always returns days in Mon→Sun order starting from
// "today" conceptually, so we just line them up 1:1 with the picked date).
function buildPlanDates(startDate: Date): Date[] {
  const start = startOfDay(startDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatDayPill(d: Date): string {
  return d.toLocaleDateString([], { weekday: "short", day: "numeric" });
}

function formatFullDate(d: Date): string {
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export default function MealPlanScreen() {
  const router = useRouter();
  const mealPlanner = useMealPlanner();
  const { data: savedRecipes = [] } = useRecipes();
  const scheduleMeal = useScheduleMeal();
  const [makeHealthy, setMakeHealthy] = useState(false);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [startDate, setStartDate] = useState(() => startOfDay(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mealTimes, setMealTimes] = useState<Record<MealSlot["meal"], Date>>(() => {
    const times = {} as Record<MealSlot["meal"], Date>;
    for (const slot of MEAL_SLOTS) {
      times[slot] = timeAt(DEFAULT_MEAL_TIMES[slot].hour, DEFAULT_MEAL_TIMES[slot].minute);
    }
    return times;
  });
  const [editingMealTime, setEditingMealTime] = useState<MealSlot["meal"] | null>(null);
  const [schedulingWeek, setSchedulingWeek] = useState(false);
  const [preferencesText, setPreferencesText] = useState("");
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [showRecipePicker, setShowRecipePicker] = useState(false);

  const planDates = useMemo(() => buildPlanDates(startDate), [startDate]);
  const recipeById = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const r of savedRecipes) map.set(r.id, r);
    return map;
  }, [savedRecipes]);

  const toggleSelectedRecipe = (id: string) => {
    setSelectedRecipeIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const generate = async () => {
    try {
      const result = await mealPlanner.mutateAsync({
        makeHealthy,
        preferences: preferencesText,
        preferredRecipeIds: selectedRecipeIds,
      });
      setPlan(result);
      setSelectedDay(0);
      setChecked({});
    } catch (e: any) {
      Alert.alert("Couldn't generate plan", e.message || "Try again in a moment.");
    }
  };

  const handleScheduleMeal = (m: { recipe_id: string | null; recipe_title: string }) => {
    if (!m.recipe_id) {
      Alert.alert(
        "Not a saved recipe yet",
        `"${m.recipe_title}" was invented by the plan and isn't saved to your cookbook, so it can't be scheduled. Import or save it first.`
      );
      return;
    }
    const dateKey = planDates[selectedDay] ? toDateKey(planDates[selectedDay]) : undefined;
    router.push(dateKey ? `/schedule/${m.recipe_id}?date=${dateKey}` : `/schedule/${m.recipe_id}`);
  };

  // Schedules every meal in the whole 7-day plan at once, using each meal
  // type's configured time (e.g. every Breakfast at 8:00, every Dinner at
  // 19:30). Meals without a saved recipe (AI-invented ones) are skipped —
  // there's nothing to schedule a reminder against.
  const handleScheduleWeek = async () => {
    const days = plan?.days ?? [];
    if (days.length === 0) return;

    setSchedulingWeek(true);
    let scheduled = 0;
    let skippedNoRecipe = 0;
    const failures: string[] = [];

    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      const day = days[dayIndex];
      const date = planDates[dayIndex];
      if (!date) continue;

      for (const meal of day.meals) {
        if (!meal.recipe_id) {
          skippedNoRecipe++;
          continue;
        }
        const recipe = recipeById.get(meal.recipe_id);
        if (!recipe) {
          skippedNoRecipe++;
          continue;
        }
        const mealTime = mealTimes[meal.meal] ?? mealTimes.Dinner;
        const targetEatingTime = combineDateAndTime(date, mealTime);
        try {
          await scheduleMeal.mutateAsync({
            recipe,
            scheduledDate: date,
            targetEatingTime,
            reminderOffsetMinutes: 15,
          });
          scheduled++;
        } catch (e: any) {
          failures.push(`${day.day} ${meal.meal}: ${e.message || "failed"}`);
        }
      }
    }

    setSchedulingWeek(false);

    const parts = [`Scheduled ${scheduled} meal${scheduled === 1 ? "" : "s"} this week.`];
    if (skippedNoRecipe > 0) {
      parts.push(`Skipped ${skippedNoRecipe} that aren't saved recipes yet.`);
    }
    if (failures.length > 0) {
      parts.push(`${failures.length} couldn't be scheduled (usually not enough cooking time before the meal time):\n${failures.join("\n")}`);
    }
    Alert.alert("Week scheduling done", parts.join("\n\n"), [
      { text: "OK", onPress: () => scheduled > 0 && router.push("/(tabs)/scheduled") },
    ]);
  };

  const planDays = plan?.days ?? [];
  const dayPlan = planDays[selectedDay];
  const shoppingList = plan?.shopping_list ?? [];
  const prepTips = plan?.prep_tips ?? [];
  const hasPlanData = planDays.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.header}>Meal planner</Text>
        <Text style={styles.subheader}>
          A 7-day plan built from your saved recipes.
        </Text>

        <Text style={styles.sectionLabel}>Start date</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
          <CalendarDays size={16} color="#E85D3F" />
          <Text style={styles.dateButtonText}>{formatFullDate(startDate)}</Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            minimumDate={new Date()}
            onChange={(event, selected) => {
              setShowDatePicker(false);
              if (event.type === "set" && selected) setStartDate(startOfDay(selected));
            }}
          />
        )}

        <Text style={styles.sectionLabel}>Meal times</Text>
        <Text style={styles.mealTimesHint}>
          Used when you schedule a whole week of reminders at once.
        </Text>
        <View style={styles.mealTimesRow}>
          {MEAL_SLOTS.map((slot) => (
            <TouchableOpacity
              key={slot}
              style={styles.mealTimeButton}
              onPress={() => setEditingMealTime(slot)}
            >
              <Clock size={14} color="#E85D3F" />
              <View>
                <Text style={styles.mealTimeSlotLabel}>{slot}</Text>
                <Text style={styles.mealTimeValue}>
                  {mealTimes[slot].toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {editingMealTime && (
          <DateTimePicker
            value={mealTimes[editingMealTime]}
            mode="time"
            display="default"
            onChange={(event, selected) => {
              const slot = editingMealTime;
              setEditingMealTime(null);
              if (event.type === "set" && selected && slot) {
                setMealTimes((prev) => ({ ...prev, [slot]: selected }));
              }
            }}
          />
        )}

        <Text style={styles.sectionLabel}>Preferences for this week (optional)</Text>
        <TextInput
          style={styles.preferencesInput}
          placeholder="e.g. mostly Italian, no seafood, quick meals only"
          placeholderTextColor="#A9998A"
          value={preferencesText}
          onChangeText={setPreferencesText}
          multiline
        />

        <TouchableOpacity style={styles.pickRecipesButton} onPress={() => setShowRecipePicker(true)}>
          <BookOpen size={16} color="#E85D3F" />
          <Text style={styles.pickRecipesButtonText}>
            {selectedRecipeIds.length > 0
              ? `${selectedRecipeIds.length} recipe${selectedRecipeIds.length > 1 ? "s" : ""} picked to include`
              : "Pick recipes to include this week"}
          </Text>
        </TouchableOpacity>

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

        {plan && !hasPlanData && (
          <Text style={styles.emptyText}>
            That didn't come back with a usable plan. Try generating again.
          </Text>
        )}

        {plan && hasPlanData && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayRow}
            >
              {planDays.map((d, i) => (
                <TouchableOpacity
                  key={`${d.day}-${i}`}
                  style={[styles.dayPill, selectedDay === i && styles.dayPillActive]}
                  onPress={() => setSelectedDay(i)}
                >
                  <Text style={[styles.dayPillText, selectedDay === i && styles.dayPillTextActive]}>
                    {planDates[i] ? formatDayPill(planDates[i]) : d.day}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {planDates[selectedDay] && (
              <Text style={styles.selectedDateLabel}>{formatFullDate(planDates[selectedDay])}</Text>
            )}

            <View style={styles.mealsCard}>
              {(dayPlan?.meals ?? []).map((m) => (
                <View key={m.meal} style={styles.mealRow}>
                  <Text style={styles.mealSlot}>{m.meal}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealTitle}>{m.recipe_title}</Text>
                    <Text style={styles.mealNote}>{m.quick_prep_note}</Text>
                  </View>
                  <IconButton
                    icon={AlarmClock}
                    label="Schedule"
                    onPress={() => handleScheduleMeal(m)}
                    style={!m.recipe_id && { opacity: 0.4 }}
                  />
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.scheduleWeekButton, schedulingWeek && { opacity: 0.6 }]}
              onPress={handleScheduleWeek}
              disabled={schedulingWeek}
            >
              <AlarmClock size={18} color="#fff" />
              <Text style={styles.scheduleWeekButtonText}>
                {schedulingWeek ? "Scheduling week..." : "Schedule this week"}
              </Text>
            </TouchableOpacity>

            {prepTips.length > 0 && (
              <View style={styles.tipsBox}>
                <Text style={styles.tipsTitle}>Prep tips</Text>
                {prepTips.map((tip, i) => (
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
                {shoppingList.map((item, i) => (
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

      <Modal
        visible={showRecipePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRecipePicker(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Include these recipes this week</Text>
            <Text style={styles.sheetSubtitle}>
              Each pick is guaranteed a slot somewhere in the 7-day plan.
            </Text>
            <ScrollView style={styles.recipePickerScroll}>
              {savedRecipes.map((r: Recipe) => {
                const active = selectedRecipeIds.includes(r.id);
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.recipePickerRow}
                    onPress={() => toggleSelectedRecipe(r.id)}
                  >
                    <Text style={styles.recipePickerRowText} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <View style={[styles.pickerCheckbox, active && styles.pickerCheckboxActive]}>
                      {active && <Check size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {savedRecipes.length === 0 && (
                <Text style={styles.emptyText}>No saved recipes yet.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowRecipePicker(false)}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  header: { fontSize: 24, fontWeight: "800", color: "#2B2118" },
  subheader: { fontSize: 14, color: "#8A7A6C", marginTop: 6, marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#2B2118", marginBottom: 8 },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  dateButtonText: { fontSize: 14, fontWeight: "600", color: "#2B2118" },
  selectedDateLabel: { fontSize: 13, color: "#8A7A6C", marginBottom: 10 },
  mealTimesHint: { fontSize: 12, color: "#8A7A6C", marginTop: -4, marginBottom: 10 },
  mealTimesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  mealTimeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    minWidth: "47%",
  },
  mealTimeSlotLabel: { fontSize: 11, color: "#8A7A6C", fontWeight: "600" },
  mealTimeValue: { fontSize: 14, color: "#2B2118", fontWeight: "700" },
  scheduleWeekButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#4C6FE8",
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 16,
  },
  scheduleWeekButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
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
  emptyText: { textAlign: "center", color: "#8A7A6C", marginTop: 20 },
  preferencesInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#2B2118",
    borderWidth: 1,
    borderColor: "#EFE2D6",
    minHeight: 56,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  pickRecipesButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    marginBottom: 16,
  },
  pickRecipesButtonText: { fontSize: 14, fontWeight: "600", color: "#2B2118" },
  backdrop: { flex: 1, backgroundColor: "rgba(43,33,24,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFF8F0", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#2B2118", marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, color: "#8A7A6C", marginBottom: 16 },
  recipePickerScroll: { maxHeight: 340 },
  recipePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE2D6",
  },
  recipePickerRowText: { fontSize: 15, color: "#2B2118", fontWeight: "500", flex: 1, marginRight: 12 },
  pickerCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D8C9BB",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCheckboxActive: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  doneButton: { backgroundColor: "#E85D3F", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  doneButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
