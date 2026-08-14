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
import { Clock, Bell, Minus, Plus, Search, Link2, ChevronLeft } from "lucide-react-native";
import { useRecipe, useRecipes } from "@/hooks/useRecipes";
import { useImportRecipe } from "@/hooks/useImport";
import { useScheduleMeal } from "@/hooks/useScheduledMeals";
import IconButton from "@/components/IconButton";
import type { Recipe } from "@/shared/types";

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

// How many dates a single schedule action can cover at once — keeps the
// number of notifications/calendar events/DB rows created in one tap sane.
const MAX_SELECTABLE_DATES = 14;

export default function ScheduleMeal() {
  const { id, date: prefillDate } = useLocalSearchParams<{ id: string; date?: string }>();
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

  // Arriving from the Meal Planner passes ?date=YYYY-MM-DD for the day the
  // AI plan had this meal on — preselect it so the user doesn't re-pick it.
  const [selectedDates, setSelectedDates] = useState<string[]>(() =>
    prefillDate && /^\d{4}-\d{2}-\d{2}$/.test(prefillDate) ? [prefillDate] : []
  );
  const [eatingTime, setEatingTime] = useState(() => {
    const t = new Date();
    t.setHours(t.getHours() + 2, 0, 0, 0);
    return t;
  });
  const [reminderOffset, setReminderOffset] = useState(15);
  const [notes, setNotes] = useState("");
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const totalMinutes = (recipe?.prep_time ?? 0) + (recipe?.cook_time ?? 0);

  const sortedDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);

  const previewEntries = useMemo(
    () =>
      sortedDates.map((key) => {
        const eating = combineDateAndTime(fromDateKey(key), eatingTime);
        const start = new Date(eating.getTime() - totalMinutes * 60 * 1000);
        const reminder = new Date(start.getTime() - reminderOffset * 60 * 1000);
        // Not enough runway between now and cooking start — the reminder/alarm
        // would have nothing to fire against.
        const valid = start.getTime() > Date.now();
        return { key, eating, start, reminder, valid };
      }),
    [sortedDates, eatingTime, totalMinutes, reminderOffset]
  );

  const invalidEntries = useMemo(
    () => previewEntries.filter((e) => !e.valid),
    [previewEntries]
  );

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const key of selectedDates) {
      marks[key] = { selected: true, selectedColor: "#E85D3F", selectedTextColor: "#fff" };
    }
    return marks;
  }, [selectedDates]);

  const toggleDate = (day: DateData) => {
    setSelectedDates((prev) => {
      if (prev.includes(day.dateString)) {
        return prev.filter((d) => d !== day.dateString);
      }
      if (prev.length >= MAX_SELECTABLE_DATES) {
        Alert.alert(
          "That's a lot of dates",
          `You can schedule up to ${MAX_SELECTABLE_DATES} dates at once. Schedule this batch first, then add more.`
        );
        return prev;
      }
      return [...prev, day.dateString];
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
    if (invalidEntries.length > 0) {
      Alert.alert(
        "Not enough time to cook",
        `${recipe.title} needs ${totalMinutes} min (prep + cook). These dates don't leave ` +
          `enough runway before your eating time — pick a later time or remove them:\n\n` +
          invalidEntries.map((e) => formatDate(e.eating)).join("\n")
      );
      return;
    }
    setScheduling(true);
    const failures: string[] = [];
    for (const key of sortedDates) {
      const targetEatingTime = combineDateAndTime(fromDateKey(key), eatingTime);
      try {
        await scheduleMeal.mutateAsync({
          recipe,
          scheduledDate: fromDateKey(key),
          targetEatingTime,
          reminderOffsetMinutes: reminderOffset,
          notes,
        });
      } catch (e: any) {
        failures.push(`${formatDate(fromDateKey(key))}: ${e.message || "failed"}`);
      }
    }
    setScheduling(false);

    const scheduledCount = sortedDates.length - failures.length;
    if (failures.length === 0) {
      Alert.alert(
        "Meal scheduled!",
        `${recipe.title} is scheduled on ${scheduledCount} date${scheduledCount > 1 ? "s" : ""} at ${formatTime(eatingTime)}.`,
        [{ text: "OK", onPress: () => router.replace("/(tabs)/scheduled") }]
      );
    } else {
      Alert.alert(
        "Some dates couldn't be scheduled",
        `Scheduled ${scheduledCount} of ${sortedDates.length}.\n\n${failures.join("\n")}`,
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

        <Text style={styles.sectionTitle}>Pick one or more dates</Text>
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

        <Text style={styles.sectionTitle}>Eating time (applies to every selected date)</Text>
        <TouchableOpacity style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
          <Clock size={16} color="#E85D3F" />
          <Text style={styles.pickerButtonText}>{formatTime(eatingTime)}</Text>
        </TouchableOpacity>

        {showTimePicker && (
          <DateTimePicker
            value={eatingTime}
            mode="time"
            display="default"
            onChange={(event, selected) => {
              setShowTimePicker(false);
              if (event.type === "set" && selected) setEatingTime(selected);
            }}
          />
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

        {previewEntries.length > 0 && (
          <View style={styles.previewBox}>
            {previewEntries.map((entry) => (
              <View key={entry.key} style={{ marginBottom: 10 }}>
                <Text style={styles.previewDateHeading}>{formatDate(entry.eating)}</Text>
                {entry.valid ? (
                  <>
                    <View style={styles.previewRow}>
                      <Bell size={14} color="#8A6558" />
                      <Text style={styles.previewText}>Reminder at {formatTime(entry.reminder)}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Clock size={14} color="#8A6558" />
                      <Text style={styles.previewText}>Start cooking at {formatTime(entry.start)}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.previewWarningText}>
                    Not enough time to cook before this eating time — pick a later time.
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.scheduleButton,
            (scheduling || sortedDates.length === 0 || invalidEntries.length > 0) && { opacity: 0.6 },
          ]}
          onPress={handleSchedule}
          disabled={scheduling || sortedDates.length === 0 || invalidEntries.length > 0}
        >
          <Text style={styles.scheduleButtonText}>
            {scheduling
              ? "Scheduling..."
              : sortedDates.length > 1
              ? `Schedule ${sortedDates.length} meals`
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
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#2B2118", marginBottom: 10, marginTop: 8 },
  changeRecipeButton: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12, alignSelf: "flex-start" },
  changeRecipeText: { fontSize: 13, color: "#E85D3F", fontWeight: "700" },
  calendarCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    overflow: "hidden",
    marginBottom: 8,
  },
  selectedCountText: { fontSize: 12, color: "#8A7A6C", marginBottom: 8 },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  pickerButtonText: { fontSize: 14, fontWeight: "600", color: "#2B2118" },
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
