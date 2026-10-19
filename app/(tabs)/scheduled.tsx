import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Clock, Bell, Trash2, CalendarClock, Plus } from "lucide-react-native";
import { useScheduledMeals, useDeleteScheduledMeal } from "@/hooks/useScheduledMeals";
import IconButton from "@/components/IconButton";
import type { ScheduledMeal } from "@/shared/types";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function Scheduled() {
  const router = useRouter();
  const { data: meals = [], isLoading } = useScheduledMeals();
  const deleteScheduledMeal = useDeleteScheduledMeal();

  const confirmDelete = (meal: ScheduledMeal) => {
    Alert.alert(
      "Cancel this scheduled meal?",
      "This removes the reminder and calendar event too.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel meal",
          style: "destructive",
          onPress: () => deleteScheduledMeal.mutate(meal),
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: ScheduledMeal }) => {
    const isPast = new Date(item.target_eating_time).getTime() < Date.now();
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => router.push(`/recipe/${item.recipe_id}`)}
      >
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {item.recipe_title}
          </Text>
          {!!item.meal_type && (
            <View style={styles.mealBadge}>
              <Text style={styles.mealBadgeText}>{item.meal_type}</Text>
            </View>
          )}
          <View style={styles.rowMeta}>
            <Clock size={12} color="#8A7A6C" />
            <Text style={styles.rowMetaText}>Start cooking {formatDateTime(item.start_cooking_time)}</Text>
          </View>
          <View style={styles.rowMeta}>
            <CalendarClock size={12} color="#8A7A6C" />
            <Text style={styles.rowMetaText}>Eat by {formatDateTime(item.target_eating_time)}</Text>
          </View>
          <View style={styles.rowMeta}>
            <Bell size={12} color="#8A7A6C" />
            <Text style={styles.rowMetaText}>Reminder {item.reminder_offset} min before</Text>
          </View>
          {item.notes && (
            <Text numberOfLines={2} style={styles.notesText}>
              {item.notes}
            </Text>
          )}
          {isPast && <Text style={styles.pastBadge}>Past</Text>}
        </View>
        <IconButton icon={Trash2} color="#B3574A" onPress={() => confirmDelete(item)} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Scheduled Meals</Text>
        <IconButton icon={Plus} label="Add" onPress={() => router.push("/schedule/new")} />
      </View>
      <FlatList
        data={meals}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.emptyText}>
              No meals scheduled yet. Open a recipe and tap "Schedule this meal".
            </Text>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    marginBottom: 12,
  },
  header: { fontSize: 24, fontWeight: "800", color: "#2B2118" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#2B2118", marginBottom: 4 },
  mealBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FDE6DD",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  mealBadgeText: { fontSize: 11, fontWeight: "700", color: "#B7482E" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  rowMetaText: { fontSize: 12, color: "#8A7A6C" },
  notesText: { fontSize: 12, color: "#8A6558", fontStyle: "italic", marginTop: 4 },
  pastBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: "#8A7A6C",
    backgroundColor: "#F5EBE0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  emptyText: { textAlign: "center", color: "#8A7A6C", marginTop: 40 },
});
