import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { cancelScheduledNotification, scheduleCookingReminder } from "@/lib/notifications";
import { addMealCalendarEvent, removeMealCalendarEvent } from "@/lib/calendarEvents";
import type { Recipe, ScheduledMeal } from "@/shared/types";

const SCHEDULED_MEALS_KEY = ["scheduled_meals"];

export function useScheduledMeals() {
  const userId = useAuthStore((s) => s.session?.user.id);

  return useQuery({
    queryKey: SCHEDULED_MEALS_KEY,
    enabled: !!userId,
    queryFn: async (): Promise<ScheduledMeal[]> => {
      const { data, error } = await supabase
        .from("scheduled_meals")
        .select("*")
        .order("target_eating_time", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

interface ScheduleMealInput {
  recipe: Recipe;
  scheduledDate: Date;
  targetEatingTime: Date;
  reminderOffsetMinutes: number;
  notes?: string;
}

export function useScheduleMeal() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);

  return useMutation({
    mutationFn: async (input: ScheduleMealInput): Promise<ScheduledMeal> => {
      if (!userId) throw new Error("Not signed in.");

      const prepTime = input.recipe.prep_time ?? 0;
      const cookTime = input.recipe.cook_time ?? 0;
      const totalMinutes = prepTime + cookTime;

      // Cooking Start Time = Target Eating Time - (Prep Time + Cook Time)
      const startCookingTime = new Date(
        input.targetEatingTime.getTime() - totalMinutes * 60 * 1000
      );

      if (startCookingTime.getTime() <= Date.now()) {
        throw new Error(
          "That eating time doesn't leave enough time to cook — pick a later time."
        );
      }

      const notificationId = await scheduleCookingReminder({
        recipeTitle: input.recipe.title,
        prepTime,
        cookTime,
        startCookingAt: startCookingTime,
        targetEatingAt: input.targetEatingTime,
        reminderOffsetMinutes: input.reminderOffsetMinutes,
      });

      const calendarEventId = await addMealCalendarEvent({
        title: `Cook: ${input.recipe.title}`,
        startAt: startCookingTime,
        endAt: input.targetEatingTime,
        notes: [
          `Prep ${prepTime} min + cook ${cookTime} min. Scheduled from Recipe Genie.`,
          input.notes?.trim(),
        ]
          .filter(Boolean)
          .join("\n\n"),
      });

      const { data, error } = await supabase
        .from("scheduled_meals")
        .insert({
          user_id: userId,
          recipe_id: input.recipe.id,
          recipe_title: input.recipe.title,
          scheduled_date: input.scheduledDate.toISOString().slice(0, 10),
          prep_time: prepTime,
          cook_time: cookTime,
          start_cooking_time: startCookingTime.toISOString(),
          target_eating_time: input.targetEatingTime.toISOString(),
          reminder_offset: input.reminderOffsetMinutes,
          notification_id: notificationId,
          calendar_event_id: calendarEventId,
          notes: input.notes?.trim() || null,
        })
        .select()
        .single();

      if (error) {
        // Roll back the side effects we already committed so we don't leave
        // a dangling notification/calendar event with no DB record.
        await cancelScheduledNotification(notificationId);
        await removeMealCalendarEvent(calendarEventId);
        throw error;
      }

      return data as ScheduledMeal;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCHEDULED_MEALS_KEY });
    },
  });
}

export function useDeleteScheduledMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meal: ScheduledMeal) => {
      await cancelScheduledNotification(meal.notification_id);
      await removeMealCalendarEvent(meal.calendar_event_id);
      const { error } = await supabase.from("scheduled_meals").delete().eq("id", meal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCHEDULED_MEALS_KEY });
    },
  });
}
