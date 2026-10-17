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
import { Calendar, type DateData } from "react-native-calendars";
import { useRouter } from "expo-router";
import {
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  Sparkles,
  AlarmClock,
  Clock,
  BookOpen,
  Check,
  CheckSquare,
  Square,
} from "lucide-react-native";
import { useMealPlanner } from "@/hooks/useImport";
import { useRecipes } from "@/hooks/useRecipes";
import { useScheduleMeal } from "@/hooks/useScheduledMeals";
import { ensureNotificationPermission } from "@/lib/notifications";
import IconButton from "@/components/IconButton";
import type { MealPlan, Recipe } from "@/shared/types";
import { MEAL_TYPES, mealTimeFromDefaults, type MealType } from "@/shared/categories";

const MAX_DATES = 14;

function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayPill(d: Date): string {
  return d.toLocaleDateString([], { weekday: "short", day: "numeric" });
}

function formatFullDate(d: Date): string {
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

type DateSlots = Record<string, MealType[]>;

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

  // Custom multi-date selection
  const [selectedDates, setSelectedDates] = useState<string[]>(() => [toDateKey(new Date())]);
  const [enabledSlots, setEnabledSlots] = useState<MealType[]>([...MEAL_TYPES]);
  const [dateSlots, setDateSlots] = useState<DateSlots>(() => ({
    [toDateKey(new Date())]: [...MEAL_TYPES],
  }));

  const [mealTimes, setMealTimes] = useState<Record<MealType, Date>>(() => {
    const times = {} as Record<MealType, Date>;
    for (const slot of MEAL_TYPES) {
      times[slot] = mealTimeFromDefaults(slot);
    }
    return times;
  });
  const [editingMealTime, setEditingMealTime] = useState<MealType | null>(null);
  const [schedulingWeek, setSchedulingWeek] = useState(false);
  const [preferencesText, setPreferencesText] = useState("");
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [showRecipePicker, setShowRecipePicker] = useState(false);

  const sortedDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);

  const recipeById = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const r of savedRecipes) map.set(r.id, r);
    return map;
  }, [savedRecipes]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const key of selectedDates) {
      marks[key] = { selected: true, selectedColor: "#E85D3F", selectedTextColor: "#fff" };
    }
    return marks;
  }, [selectedDates]);

  const toggleSlot = (slot: MealType) => {
    setEnabledSlots((prev) => {
      const next = prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot];
      // Allow zero globally? User asked for choice including none — keep at least empty ok for UI,
      // but generate will require ≥1. Sync date slots to remaining enabled.
      setDateSlots((ds) => {
        const updated: DateSlots = {};
        for (const [k, slots] of Object.entries(ds)) {
          const filtered = slots.filter((s) => next.includes(s));
          updated[k] = filtered.length > 0 ? filtered : [...next];
        }
        return updated;
      });
      return next;
    });
  };

  const toggleDate = (day: DateData) => {
    setSelectedDates((prev) => {
      if (prev.includes(day.dateString)) {
        setDateSlots((ds) => {
          const next = { ...ds };
          delete next[day.dateString];
          return next;
        });
        return prev.filter((d) => d !== day.dateString);
      }
      if (prev.length >= MAX_DATES) {
        Alert.alert("Limit reached", `You can plan up to ${MAX_DATES} dates at once.`);
        return prev;
      }
      setDateSlots((ds) => ({
        ...ds,
        [day.dateString]: enabledSlots.length ? [...enabledSlots] : [...MEAL_TYPES],
      }));
      return [...prev, day.dateString];
    });
  };

  const toggleDateSlot = (dateKey: string, slot: MealType) => {
    if (!enabledSlots.includes(slot) && enabledSlots.length > 0) return;
    setDateSlots((prev) => {
      const current = prev[dateKey] ?? [...enabledSlots];
      const has = current.includes(slot);
      const next = has ? current.filter((s) => s !== slot) : [...current, slot];
      // Zero slots allowed on a date (user choice) — date stays selected but empty
      return { ...prev, [dateKey]: next };
    });
  };

  const toggleSelectedRecipe = (id: string) => {
    setSelectedRecipeIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const generate = async () => {
    if (sortedDates.length === 0) {
      Alert.alert("Pick dates", "Select at least one date on the calendar.");
      return;
    }
    const anySlots = sortedDates.some((d) => (dateSlots[d] ?? []).length > 0);
    if (!anySlots || enabledSlots.length === 0) {
      Alert.alert("Pick meal slots", "Choose at least one slot (Breakfast / Lunch / Snack / Dinner).");
      return;
    }

    try {
      const result = await mealPlanner.mutateAsync({
        makeHealthy,
        preferences: [
          preferencesText.trim(),
          `Plan for ${sortedDates.length} day(s). Prefer these meal slots: ${enabledSlots.join(", ")}.`,
        ]
          .filter(Boolean)
          .join(" "),
        preferredRecipeIds: selectedRecipeIds,
      });

      // Map AI days onto user-selected dates (as many as picked)
      const mappedDays = sortedDates.map((key, i) => {
        const src = result.days[i] ?? result.days[i % Math.max(result.days.length, 1)];
        const slotsForDate = dateSlots[key] ?? enabledSlots;
        const meals = (src?.meals ?? [])
          .filter((m) => slotsForDate.includes(m.meal as MealType))
          .map((m) => ({ ...m }));
        // Ensure every selected slot exists (fill from AI pool or placeholder)
        for (const slot of slotsForDate) {
          if (!meals.some((m) => m.meal === slot)) {
            const fallback =
              result.days.flatMap((d) => d.meals).find((m) => m.meal === slot) ||
              result.days[0]?.meals?.[0];
            meals.push({
              meal: slot,
              recipe_title: fallback?.recipe_title ?? `${slot} pick`,
              recipe_id: fallback?.recipe_id ?? null,
              quick_prep_note: fallback?.quick_prep_note ?? "Adjust from your cookbook",
            });
          }
        }
        meals.sort(
          (a, b) => MEAL_TYPES.indexOf(a.meal as MealType) - MEAL_TYPES.indexOf(b.meal as MealType)
        );
        return {
          day: formatDayPill(fromDateKey(key)),
          meals,
        };
      });

      setPlan({
        ...result,
        days: mappedDays,
      });
      setSelectedDay(0);
      setChecked({});
    } catch (e: any) {
      Alert.alert("Couldn't generate plan", e.message || "Try again in a moment.");
    }
  };

  const handleScheduleMeal = (m: {
    recipe_id: string | null;
    recipe_title: string;
    meal: string;
  }) => {
    if (!m.recipe_id) {
      Alert.alert(
        "Not a saved recipe yet",
        `"${m.recipe_title}" isn't in your cookbook yet, so it can't be scheduled. Import it first.`
      );
      return;
    }
    const dateKey = sortedDates[selectedDay];
    const mealQ = encodeURIComponent(m.meal);
    if (dateKey) {
      router.push(`/schedule/${m.recipe_id}?date=${dateKey}&meal=${mealQ}`);
    } else {
      router.push(`/schedule/${m.recipe_id}?meal=${mealQ}`);
    }
  };

  const handleSchedulePlan = async () => {
    const days = plan?.days ?? [];
    if (days.length === 0) return;

    const notifOk = await ensureNotificationPermission();
    if (!notifOk) {
      Alert.alert(
        "Enable notifications",
        "Turn on notifications so cooking reminders arrive at the right time."
      );
      return;
    }

    setSchedulingWeek(true);
    let scheduled = 0;
    let skippedNoRecipe = 0;
    const failures: string[] = [];

    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      const day = days[dayIndex];
      const dateKey = sortedDates[dayIndex];
      if (!dateKey) continue;
      const date = fromDateKey(dateKey);
      const slotsForDate = dateSlots[dateKey] ?? enabledSlots;

      for (const meal of day.meals) {
        if (!slotsForDate.includes(meal.meal as MealType)) continue;
        if (!meal.recipe_id) {
          skippedNoRecipe++;
          continue;
        }
        const recipe = recipeById.get(meal.recipe_id);
        if (!recipe) {
          skippedNoRecipe++;
          continue;
        }
        const mealTime = mealTimes[meal.meal as MealType] ?? mealTimes.Dinner;
        const targetEatingTime = combineDateAndTime(date, mealTime);
        try {
          await scheduleMeal.mutateAsync({
            recipe,
            scheduledDate: date,
            targetEatingTime,
            reminderOffsetMinutes: 15,
            mealType: meal.meal,
          });
          scheduled++;
        } catch (e: any) {
          failures.push(`${day.day} ${meal.meal}: ${e.message || "failed"}`);
        }
      }
    }

    setSchedulingWeek(false);

    const parts = [`Scheduled ${scheduled} meal reminder${scheduled === 1 ? "" : "s"}.`];
    if (skippedNoRecipe > 0) {
      parts.push(`Skipped ${skippedNoRecipe} that aren't saved recipes yet.`);
    }
    if (failures.length > 0) {
      parts.push(`${failures.length} failed:\n${failures.join("\n")}`);
    }
    Alert.alert("Plan scheduled", parts.join("\n\n"), [
      { text: "OK", onPress: () => scheduled > 0 && router.push("/(tabs)/scheduled") },
    ]);
  };

  const planDays = plan?.days ?? [];
  const dayPlan = planDays[selectedDay];
  const shoppingList = plan?.shopping_list ?? [];
  const prepTips = plan?.prep_tips ?? [];
  const hasPlanData = planDays.length > 0;
  const activeDateKey = sortedDates[selectedDay];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.header}>Meal planner</Text>
        <Text style={styles.subheader}>
          Pick any dates, choose meal slots per day, generate a plan, then schedule reminders.
        </Text>

        <Text style={styles.sectionLabel}>Pick dates (as many as you want)</Text>
        <View style={styles.calendarCard}>
          <Calendar
            current={sortedDates[0] ?? toDateKey(new Date())}
            minDate={toDateKey(new Date())}
            markedDates={markedDates}
            onDayPress={toggleDate}
            theme={{
              todayTextColor: "#E85D3F",
              selectedDayBackgroundColor: "#E85D3F",
              arrowColor: "#E85D3F",
              textDayFontWeight: "500",
              textMonthFontWeight: "700",
            }}
          />
        </View>
        <Text style={styles.helperText}>
          {sortedDates.length} date{sortedDates.length === 1 ? "" : "s"} selected
        </Text>

        <Text style={styles.sectionLabel}>Meal slots</Text>
        <Text style={styles.helperText}>
          Tick Breakfast / Lunch / Snack / Dinner. One date can have multiple slots — or none.
        </Text>
        <View style={styles.slotBox}>
          {MEAL_TYPES.map((slot) => {
            const on = enabledSlots.includes(slot);
            return (
              <View key={slot} style={styles.slotRow}>
                <TouchableOpacity style={styles.slotCheck} onPress={() => toggleSlot(slot)}>
                  {on ? (
                    <CheckSquare size={22} color="#E85D3F" />
                  ) : (
                    <Square size={22} color="#C9B8A8" />
                  )}
                  <Text style={[styles.slotLabel, !on && styles.slotLabelOff]}>{slot}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.timeChip, !on && { opacity: 0.4 }]}
                  disabled={!on}
                  onPress={() => setEditingMealTime(slot)}
                >
                  <Clock size={14} color="#E85D3F" />
                  <Text style={styles.timeChipText}>
                    {mealTimes[slot].toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {editingMealTime && (
          <DateTimePicker
            value={mealTimes[editingMealTime]}
            mode="time"
            display="default"
            onValueChange={(event, selected) => {
              const slot = editingMealTime;
              setEditingMealTime(null);
              if (selected && slot) {
                setMealTimes((prev) => ({ ...prev, [slot]: selected }));
              }
            }}
            onDismiss={() => setEditingMealTime(null)}
          />
        )}

        {sortedDates.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Slots per date</Text>
            <Text style={styles.helperText}>
              Example: first date = Lunch only, another = Breakfast + Dinner.
            </Text>
            {sortedDates.map((key) => (
              <View key={key} style={styles.dateSlotCard}>
                <Text style={styles.dateSlotHeading}>{formatFullDate(fromDateKey(key))}</Text>
                <View style={styles.dateChips}>
                  {MEAL_TYPES.map((slot) => {
                    const available = enabledSlots.includes(slot) || enabledSlots.length === 0;
                    const selected = (dateSlots[key] ?? []).includes(slot);
                    return (
                      <TouchableOpacity
                        key={slot}
                        disabled={!available && enabledSlots.length > 0}
                        style={[
                          styles.dateChip,
                          selected && styles.dateChipOn,
                          !available && enabledSlots.length > 0 && styles.dateChipDisabled,
                        ]}
                        onPress={() => toggleDateSlot(key, slot)}
                      >
                        <Text
                          style={[styles.dateChipText, selected && styles.dateChipTextOn]}
                        >
                          {slot}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {(dateSlots[key] ?? []).length === 0 && (
                  <Text style={styles.zeroSlotsNote}>No slots on this date</Text>
                )}
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionLabel}>Flavor Twists & Preferences (optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
          {[
            "🌶️ Spicy & Bold",
            "🧄 Garlic & Herb",
            "🧀 Creamy Savory",
            "🍋 Lemon Tangy",
            "🥑 High Protein / Low Carb",
            "⏱️ Quick 15-Min Meals",
          ].map((preset) => {
            const active = preferencesText.includes(preset);
            return (
              <TouchableOpacity
                key={preset}
                style={[
                  {
                    backgroundColor: active ? "#E85D3F" : "#fff",
                    borderRadius: 20,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: active ? "#E85D3F" : "#EFE2D6",
                  },
                ]}
                onPress={() => {
                  if (active) {
                    setPreferencesText((prev) => prev.replace(preset, "").trim());
                  } else {
                    setPreferencesText((prev) => (prev ? `${prev}, ${preset}` : preset));
                  }
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: active ? "#fff" : "#2B2118" }}>
                  {preset}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TextInput
          style={styles.preferencesInput}
          placeholder="e.g. Garlic herb twist, mostly Italian, quick 15-min meals..."
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
              : "Pick recipes to include"}
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
              ? "Regenerate plan"
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
                  <Text
                    style={[styles.dayPillText, selectedDay === i && styles.dayPillTextActive]}
                  >
                    {sortedDates[i] ? formatDayPill(fromDateKey(sortedDates[i])) : d.day}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {activeDateKey && (
              <Text style={styles.selectedDateLabel}>
                {formatFullDate(fromDateKey(activeDateKey))}
              </Text>
            )}

            <View style={styles.mealsCard}>
              {(dayPlan?.meals ?? []).length === 0 ? (
                <Text style={styles.emptyText}>No meal slots on this date.</Text>
              ) : (
                (dayPlan?.meals ?? []).map((m) => (
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
                ))
              )}
            </View>

            <TouchableOpacity
              style={[styles.scheduleWeekButton, schedulingWeek && { opacity: 0.6 }]}
              onPress={handleSchedulePlan}
              disabled={schedulingWeek}
            >
              <AlarmClock size={18} color="#fff" />
              <Text style={styles.scheduleWeekButtonText}>
                {schedulingWeek ? "Scheduling..." : "Schedule plan + reminders"}
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
            <Text style={styles.sheetTitle}>Include these recipes</Text>
            <Text style={styles.sheetSubtitle}>
              Each pick is used at least once across your selected dates.
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
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#2B2118", marginBottom: 8, marginTop: 4 },
  helperText: { fontSize: 12, color: "#8A7A6C", marginBottom: 10, lineHeight: 17 },
  calendarCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    overflow: "hidden",
    marginBottom: 8,
  },
  slotBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  slotRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slotCheck: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  slotLabel: { fontSize: 15, fontWeight: "600", color: "#2B2118" },
  slotLabelOff: { color: "#B3A392" },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FDE6DD",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timeChipText: { fontSize: 13, fontWeight: "700", color: "#B7482E" },
  dateSlotCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    padding: 12,
    marginBottom: 8,
  },
  dateSlotHeading: { fontSize: 13, fontWeight: "700", color: "#2B2118", marginBottom: 8 },
  dateChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dateChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#F5EBE0",
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  dateChipOn: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  dateChipDisabled: { opacity: 0.35 },
  dateChipText: { fontSize: 12, fontWeight: "600", color: "#8A7A6C" },
  dateChipTextOn: { color: "#fff" },
  zeroSlotsNote: { marginTop: 8, fontSize: 12, color: "#B3A392", fontStyle: "italic" },
  selectedDateLabel: { fontSize: 13, color: "#8A7A6C", marginBottom: 10 },
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
  button: {
    backgroundColor: "#E85D3F",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  dayRow: { gap: 8, marginBottom: 16 },
  dayPill: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  dayPillActive: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  dayPillText: { fontSize: 13, fontWeight: "600", color: "#2B2118" },
  dayPillTextActive: { color: "#fff" },
  mealsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    marginBottom: 16,
  },
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
  shoppingList: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  shoppingItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: "#D8C9BB" },
  checkboxChecked: { backgroundColor: "#E85D3F", borderColor: "#E85D3F" },
  shoppingItemText: { fontSize: 14, color: "#2B2118" },
  shoppingItemTextChecked: { color: "#B3A392", textDecorationLine: "line-through" },
  emptyText: { textAlign: "center", color: "#8A7A6C", marginTop: 8 },
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
  sheet: {
    backgroundColor: "#FFF8F0",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
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
  recipePickerRowText: {
    fontSize: 15,
    color: "#2B2118",
    fontWeight: "500",
    flex: 1,
    marginRight: 12,
  },
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
  doneButton: {
    backgroundColor: "#E85D3F",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  doneButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
