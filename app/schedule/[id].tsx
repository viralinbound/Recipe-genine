import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, type DateData } from "react-native-calendars";
import { Clock, Bell, Minus, Plus, Search, Link2, ChevronLeft, CheckSquare, Square } from "lucide-react-native";
import { useRecipe, useRecipes } from "@/hooks/useRecipes";
import { useImportRecipe } from "@/hooks/useImport";
import { useScheduleMeal } from "@/hooks/useScheduledMeals";
import IconButton from "@/components/IconButton";
import type { Recipe } from "@/shared/types";
import {
  MEAL_TYPES,
  mealTimeFromDefaults,
  type MealType,
} from "@/shared/categories";
import { ensureNotificationPermission } from "@/lib/notifications";

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const MAX_SELECTABLE_DATES = 14;

type MealTimes = Record<MealType, Date>;
/** Per date: which meal slots are enabled for that date. */
type DateMeals = Record<string, MealType[]>;

function defaultMealTimes(): MealTimes {
  return {
    Breakfast: mealTimeFromDefaults("Breakfast"),
    Lunch: mealTimeFromDefaults("Lunch"),
    Snack: mealTimeFromDefaults("Snack"),
    Dinner: mealTimeFromDefaults("Dinner"),
  };
}

export default function ScheduleMeal() {
  const { id, date: prefillDate, meal: prefillMeal } = useLocalSearchParams<{
    id: string;
    date?: string;
    meal?: string;
  }>();
  const router = useRouter();
  const isNew = id === "new";

  const { data: preloadedRecipe, isLoading: loadingRecipe } = useRecipe(isNew ? undefined : id);
  const [manualRecipe, setManualRecipe] = useState<Recipe | null>(null);
  const recipe = isNew ? manualRecipe : preloadedRecipe;

  const { data: savedRecipes = [] } = useRecipes();
  const importRecipe = useImportRecipe();
  const [recipeSearch, setRecipeSearch] = useState("");
  const [importUrl, setImportUrl] = useState("");

  const scheduleMeal = useScheduleMeal();

  const initialMeal =
    prefillMeal && MEAL_TYPES.includes(prefillMeal as MealType)
      ? (prefillMeal as MealType)
      : null;

  const [selectedDates, setSelectedDates] = useState<string[]>(() =>
    prefillDate && /^\d{4}-\d{2}-\d{2}$/.test(prefillDate) ? [prefillDate] : []
  );
  const [enabledMeals, setEnabledMeals] = useState<MealType[]>(() =>
    initialMeal ? [initialMeal] : [...MEAL_TYPES]
  );
  const [mealTimes, setMealTimes] = useState<MealTimes>(defaultMealTimes);
  const [dateMeals, setDateMeals] = useState<DateMeals>(() => {
    if (prefillDate && /^\d{4}-\d{2}-\d{2}$/.test(prefillDate)) {
      return {
        [prefillDate]: initialMeal ? [initialMeal] : [...MEAL_TYPES],
      };
    }
    return {};
  });
  const [reminderOffset, setReminderOffset] = useState(15);
  const [notes, setNotes] = useState("");
  const [editingMealTime, setEditingMealTime] = useState<MealType | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const totalMinutes = (recipe?.prep_time ?? 0) + (recipe?.cook_time ?? 0);
  const sortedDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);

  const scheduleJobs = useMemo(() => {
    const jobs: { key: string; meal: MealType; eating: Date; start: Date; reminder: Date; valid: boolean }[] = [];
    for (const key of sortedDates) {
      const mealsForDate = (dateMeals[key] ?? []).filter((m) => enabledMeals.includes(m));
      for (const meal of mealsForDate) {
        const eating = combineDateAndTime(fromDateKey(key), mealTimes[meal]);
        const start = new Date(eating.getTime() - totalMinutes * 60 * 1000);
        const reminder = new Date(start.getTime() - reminderOffset * 60 * 1000);
        jobs.push({
          key,
          meal,
          eating,
          start,
          reminder,
          valid: start.getTime() > Date.now(),
        });
      }
    }
    return jobs;
  }, [sortedDates, dateMeals, enabledMeals, mealTimes, totalMinutes, reminderOffset]);

  const invalidJobs = useMemo(() => scheduleJobs.filter((j) => !j.valid), [scheduleJobs]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const key of selectedDates) {
      marks[key] = { selected: true, selectedColor: "#E85D3F", selectedTextColor: "#fff" };
    }
    return marks;
  }, [selectedDates]);

  const toggleGlobalMeal = (meal: MealType) => {
    setEnabledMeals((prev) => {
      const next = prev.includes(meal) ? prev.filter((m) => m !== meal) : [...prev, meal];
      // Keep at least one meal type selected
      if (next.length === 0) return prev;
      setDateMeals((dm) => {
        const updated: DateMeals = { ...dm };
        for (const key of Object.keys(updated)) {
          updated[key] = updated[key].filter((m) => next.includes(m));
          if (updated[key].length === 0) updated[key] = [...next];
        }
        return updated;
      });
      return next;
    });
  };

  const toggleDate = (day: DateData) => {
    setSelectedDates((prev) => {
      if (prev.includes(day.dateString)) {
        setDateMeals((dm) => {
          const next = { ...dm };
          delete next[day.dateString];
          return next;
        });
        return prev.filter((d) => d !== day.dateString);
      }
      if (prev.length >= MAX_SELECTABLE_DATES) {
        Alert.alert(
          "That's a lot of dates",
          `You can schedule up to ${MAX_SELECTABLE_DATES} dates at once.`
        );
        return prev;
      }
      setDateMeals((dm) => ({
        ...dm,
        [day.dateString]: [...enabledMeals],
      }));
      return [...prev, day.dateString];
    });
  };

  const toggleDateMeal = (dateKey: string, meal: MealType) => {
    if (!enabledMeals.includes(meal)) return;
    setDateMeals((prev) => {
      const current = prev[dateKey] ?? [...enabledMeals];
      const has = current.includes(meal);
      const next = has ? current.filter((m) => m !== meal) : [...current, meal];
      // Don't allow empty — keep at least one meal on a selected date
      if (next.length === 0) return prev;
      return { ...prev, [dateKey]: next };
    });
  };

  const filteredSavedRecipes = useMemo(() => {
    if (!recipeSearch.trim()) return savedRecipes;
    const q = recipeSearch.toLowerCase();
    return savedRecipes.filter((r: Recipe) => r.title.toLowerCase().includes(q));
  }, [savedRecipes, recipeSearch]);

  const handleImportLink = async () => {
    if (!importUrl.trim()) return;
    try {
      const imported = await importRecipe.mutateAsync(importUrl.trim());
      setManualRecipe(imported);
      setImportUrl("");
    } catch (e: any) {
      Alert.alert("Couldn't import that link", e.message || "Try a different URL.");
    }
  };

  const handleSchedule = async () => {
    if (!recipe) return;
    if (sortedDates.length === 0) {
      Alert.alert("Pick at least one date", "Tap a date on the calendar first.");
      return;
    }
    if (scheduleJobs.length === 0) {
      Alert.alert("Pick meal times", "Select at least one meal (Breakfast / Lunch / Snack / Dinner).");
      return;
    }
    if (invalidJobs.length > 0) {
      Alert.alert(
        "Not enough time to cook",
        `${recipe.title} needs ${totalMinutes} min. These slots don't leave enough runway:\n\n` +
          invalidJobs.map((j) => `${formatDate(j.eating)} · ${j.meal} ${formatTime(j.eating)}`).join("\n")
      );
      return;
    }

    const notifOk = await ensureNotificationPermission();
    if (!notifOk) {
      Alert.alert(
        "Enable notifications",
        "Meal reminders need notification permission. Turn them on in Profile → Notifications, then try again."
      );
      return;
    }

    setScheduling(true);
    const failures: string[] = [];
    for (const job of scheduleJobs) {
      try {
        await scheduleMeal.mutateAsync({
          recipe,
          scheduledDate: fromDateKey(job.key),
          targetEatingTime: job.eating,
          reminderOffsetMinutes: reminderOffset,
          notes,
          mealType: job.meal,
        });
      } catch (e: any) {
        failures.push(`${formatDate(job.eating)} ${job.meal}: ${e.message || "failed"}`);
      }
    }
    setScheduling(false);

    const scheduledCount = scheduleJobs.length - failures.length;
    if (failures.length === 0) {
      Alert.alert(
        "Meal scheduled!",
        `${recipe.title}: ${scheduledCount} reminder${scheduledCount > 1 ? "s" : ""} set. You'll get a notification before cooking starts.`,
        [{ text: "OK", onPress: () => router.replace("/(tabs)/scheduled") }]
      );
    } else {
      Alert.alert(
        "Some slots couldn't be scheduled",
        `Scheduled ${scheduledCount} of ${scheduleJobs.length}.\n\n${failures.join("\n")}`,
        [{ text: "OK", onPress: () => router.replace("/(tabs)/scheduled") }]
      );
    }
  };

  if (isNew && !recipe) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <Text style={styles.title}>What are you scheduling?</Text>

          <Text style={styles.sectionTitle}>Choose a saved recipe</Text>
          <View style={styles.searchWrap}>
            <Search size={16} color="#A9998A" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search your cookbook"
              placeholderTextColor="#A9998A"
              value={recipeSearch}
              onChangeText={setRecipeSearch}
            />
          </View>
          <View style={styles.recipeList}>
            <ScrollView style={styles.recipeListScroll} nestedScrollEnabled>
              {filteredSavedRecipes.map((r: Recipe) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.recipeRow}
                  onPress={() => setManualRecipe(r)}
                >
                  <Text style={styles.recipeRowText}>{r.title}</Text>
                </TouchableOpacity>
              ))}
              {filteredSavedRecipes.length === 0 && (
                <Text style={styles.emptyText}>No saved recipes match.</Text>
              )}
            </ScrollView>
          </View>

          <Text style={styles.sectionTitle}>Or paste a new recipe link</Text>
          <View style={styles.linkRow}>
            <View style={styles.linkInputWrap}>
              <Link2 size={16} color="#A9998A" />
              <TextInput
                style={styles.linkInput}
                placeholder="Paste a YouTube, blog, or Instagram link"
                placeholderTextColor="#A9998A"
                value={importUrl}
                onChangeText={setImportUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={[styles.importButton, importRecipe.isPending && { opacity: 0.6 }]}
              onPress={handleImportLink}
              disabled={importRecipe.isPending || !importUrl.trim()}
            >
              <Text style={styles.importButtonText}>
                {importRecipe.isPending ? "Importing..." : "Import"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (loadingRecipe || !recipe) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={styles.body}>
        {isNew && (
          <TouchableOpacity style={styles.changeRecipeButton} onPress={() => setManualRecipe(null)}>
            <ChevronLeft size={16} color="#E85D3F" />
            <Text style={styles.changeRecipeText}>Change recipe</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.title}>{recipe.title}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Clock size={16} color="#8A7A6C" />
            <Text style={styles.statText}>
              Prep {recipe.prep_time ?? 0} min + Cook {recipe.cook_time ?? 0} min = {totalMinutes} min total
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Meal times (pick which ones)</Text>
        <Text style={styles.helperText}>Check Breakfast / Lunch / Snack / Dinner and set each time.</Text>
        <View style={styles.mealBox}>
          {MEAL_TYPES.map((meal) => {
            const on = enabledMeals.includes(meal);
            return (
              <View key={meal} style={styles.mealRow}>
                <TouchableOpacity style={styles.mealCheck} onPress={() => toggleGlobalMeal(meal)}>
                  {on ? (
                    <CheckSquare size={22} color="#E85D3F" />
                  ) : (
                    <Square size={22} color="#C9B8A8" />
                  )}
                  <Text style={[styles.mealLabel, !on && styles.mealLabelOff]}>{meal}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.timeChip, !on && { opacity: 0.4 }]}
                  disabled={!on}
                  onPress={() => setEditingMealTime(meal)}
                >
                  <Clock size={14} color="#E85D3F" />
                  <Text style={styles.timeChipText}>{formatTime(mealTimes[meal])}</Text>
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
              const meal = editingMealTime;
              setEditingMealTime(null);
              if (selected && meal) {
                setMealTimes((prev) => ({ ...prev, [meal]: selected }));
              }
            }}
            onDismiss={() => setEditingMealTime(null)}
          />
        )}

        <Text style={styles.sectionTitle}>Pick dates</Text>
        <Text style={styles.helperText}>Tap any custom dates on the calendar.</Text>
        <View style={styles.calendarCard}>
          <Calendar
            current={selectedDates[0] ?? toDateKey(new Date())}
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
        {sortedDates.length > 0 && (
          <Text style={styles.selectedCountText}>
            {sortedDates.length} of {MAX_SELECTABLE_DATES} dates selected
          </Text>
        )}

        {sortedDates.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Meals per date</Text>
            <Text style={styles.helperText}>
              Example: first date = Lunch only, another date = Dinner — tick what you want on each day.
            </Text>
            {sortedDates.map((key) => (
              <View key={key} style={styles.dateMealCard}>
                <Text style={styles.dateMealHeading}>{formatDate(fromDateKey(key))}</Text>
                <View style={styles.dateMealChips}>
                  {MEAL_TYPES.map((meal) => {
                    const available = enabledMeals.includes(meal);
                    const selected = (dateMeals[key] ?? []).includes(meal);
                    return (
                      <TouchableOpacity
                        key={meal}
                        disabled={!available}
                        style={[
                          styles.dateChip,
                          selected && available && styles.dateChipOn,
                          !available && styles.dateChipDisabled,
                        ]}
                        onPress={() => toggleDateMeal(key, meal)}
                      >
                        <Text
                          style={[
                            styles.dateChipText,
                            selected && available && styles.dateChipTextOn,
                          ]}
                        >
                          {meal}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>Remind me before cooking starts</Text>
        <View style={styles.stepperRow}>
          <IconButton icon={Minus} onPress={() => setReminderOffset((v) => Math.max(0, v - 5))} />
          <Text style={styles.stepperValue}>{reminderOffset} min</Text>
          <IconButton icon={Plus} onPress={() => setReminderOffset((v) => Math.min(120, v + 5))} />
        </View>

        <Text style={styles.sectionTitle}>Notes (optional)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="e.g. double the recipe, guests coming"
          placeholderTextColor="#A9998A"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {scheduleJobs.length > 0 && (
          <View style={styles.previewBox}>
            {scheduleJobs.map((job) => (
              <View key={`${job.key}-${job.meal}`} style={{ marginBottom: 10 }}>
                <Text style={styles.previewDateHeading}>
                  {formatDate(job.eating)} · {job.meal} · {formatTime(job.eating)}
                </Text>
                {job.valid ? (
                  <>
                    <View style={styles.previewRow}>
                      <Bell size={14} color="#8A6558" />
                      <Text style={styles.previewText}>Reminder at {formatTime(job.reminder)}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Clock size={14} color="#8A6558" />
                      <Text style={styles.previewText}>Start cooking at {formatTime(job.start)}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.previewWarningText}>
                    Not enough time to cook before this eating time.
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.scheduleButton,
            (scheduling || scheduleJobs.length === 0 || invalidJobs.length > 0) && { opacity: 0.6 },
          ]}
          onPress={handleSchedule}
          disabled={scheduling || scheduleJobs.length === 0 || invalidJobs.length > 0}
        >
          <Text style={styles.scheduleButtonText}>
            {scheduling
              ? "Scheduling..."
              : scheduleJobs.length > 1
              ? `Schedule ${scheduleJobs.length} meals`
              : "Schedule this meal"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF8F0" },
  body: { padding: 20 },
  title: { fontSize: 22, fontWeight: "800", color: "#2B2118", marginBottom: 10 },
  statsRow: { flexDirection: "row", marginBottom: 24 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { fontSize: 13, color: "#8A7A6C" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#2B2118", marginBottom: 6, marginTop: 8 },
  helperText: { fontSize: 12, color: "#8A7A6C", marginBottom: 10, lineHeight: 17 },
  changeRecipeButton: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12, alignSelf: "flex-start" },
  changeRecipeText: { fontSize: 13, color: "#E85D3F", fontWeight: "700" },
  mealBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  mealRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mealCheck: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  mealLabel: { fontSize: 15, fontWeight: "600", color: "#2B2118" },
  mealLabelOff: { color: "#B3A392" },
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
  calendarCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    overflow: "hidden",
    marginBottom: 8,
  },
  selectedCountText: { fontSize: 12, color: "#8A7A6C", marginBottom: 8 },
  dateMealCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    padding: 12,
    marginBottom: 8,
  },
  dateMealHeading: { fontSize: 13, fontWeight: "700", color: "#2B2118", marginBottom: 8 },
  dateMealChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 20 },
  stepperValue: { fontSize: 15, fontWeight: "700", color: "#2B2118", minWidth: 56, textAlign: "center" },
  notesInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#2B2118",
    borderWidth: 1,
    borderColor: "#EFE2D6",
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  previewBox: { backgroundColor: "#FDE6DD", borderRadius: 14, padding: 16, marginBottom: 24 },
  previewDateHeading: { fontSize: 13, fontWeight: "700", color: "#B7482E", marginBottom: 4 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewText: { fontSize: 13, color: "#8A6558", fontWeight: "500" },
  previewWarningText: { fontSize: 13, color: "#C0392B", fontWeight: "600" },
  scheduleButton: {
    backgroundColor: "#E85D3F",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  scheduleButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
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
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#2B2118" },
  recipeList: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#EFE2D6", marginBottom: 24, overflow: "hidden" },
  recipeListScroll: { maxHeight: 280 },
  recipeRow: { paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#EFE2D6" },
  recipeRowText: { fontSize: 14, color: "#2B2118", fontWeight: "500" },
  emptyText: { textAlign: "center", color: "#8A7A6C", padding: 16 },
  linkRow: { gap: 10 },
  linkInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  linkInput: { flex: 1, fontSize: 14, color: "#2B2118" },
  importButton: { backgroundColor: "#E85D3F", borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  importButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
