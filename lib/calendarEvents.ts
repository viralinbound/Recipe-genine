import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

async function getWritableCalendarId(): Promise<string | null> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return null;

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((c) => c.allowsModifications);
  if (writable) return writable.id;

  if (Platform.OS === "ios") {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return defaultCalendar?.id ?? null;
  }

  // Android sometimes has no writable calendar (e.g. no Google account
  // signed in) — create a small local one dedicated to this app.
  try {
    return await Calendar.createCalendarAsync({
      title: "Recipe Genie",
      color: "#E85D3F",
      entityType: Calendar.EntityTypes.EVENT,
      source: { isLocalAccount: true, name: "Recipe Genie", type: "LOCAL" } as any,
      name: "recipeGenieMeals",
      ownerAccount: "recipeGenie",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  } catch {
    return null;
  }
}

interface MealEventParams {
  title: string;
  startAt: Date;
  endAt: Date;
  notes?: string;
}

// Creates a calendar event spanning cooking-start → target-eating time.
// Returns the created event id, or null if permission was denied or the
// event couldn't be created (calendar sync is best-effort, never blocking).
export async function addMealCalendarEvent(params: MealEventParams): Promise<string | null> {
  try {
    const calendarId = await getWritableCalendarId();
    if (!calendarId) return null;
    return await Calendar.createEventAsync(calendarId, {
      title: params.title,
      startDate: params.startAt,
      endDate: params.endAt,
      notes: params.notes,
    });
  } catch {
    return null;
  }
}

export async function removeMealCalendarEvent(eventId: string | null): Promise<void> {
  if (!eventId) return;
  try {
    await Calendar.deleteEventAsync(eventId);
  } catch {
    // event may already be gone — nothing to clean up
  }
}
