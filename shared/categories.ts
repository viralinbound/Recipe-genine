import type { MealSlot } from "./types";

export type MealType = MealSlot["meal"];

export const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Snack", "Dinner"];

/** Default eating times for the four meal slots (local hours/minutes). */
export const DEFAULT_MEAL_TIMES: Record<MealType, { hours: number; minutes: number }> = {
  Breakfast: { hours: 8, minutes: 0 },
  Lunch: { hours: 13, minutes: 0 },
  Snack: { hours: 16, minutes: 0 },
  Dinner: { hours: 19, minutes: 30 },
};

/**
 * Matches Cookbook filters (except "All").
 * Favorites is stored as is_favorite; the rest are recipe tags.
 */
export const COOKBOOK_SAVE_OPTIONS = [
  "Favorites",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Healthy",
] as const;

export type CookbookSaveOption = (typeof COOKBOOK_SAVE_OPTIONS)[number];

/** Tag categories that appear in Cookbook filters. */
export const COOKBOOK_TAG_CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Healthy"] as const;

/** Extra tags still allowed elsewhere; primary Add UI uses cookbook options. */
export const RECIPE_CATEGORIES = [
  ...COOKBOOK_TAG_CATEGORIES,
  "Snack",
  "Dessert",
  "Vegetarian",
  "Vegan",
  "Quick",
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export function mealTimeFromDefaults(meal: MealType, base = new Date()): Date {
  const t = new Date(base);
  const def = DEFAULT_MEAL_TIMES[meal];
  t.setHours(def.hours, def.minutes, 0, 0);
  return t;
}

/** Auto-detect cookbook destinations from a URL / title / caption blob. */
export function suggestCookbookSaves(text: string): CookbookSaveOption[] {
  const blob = text.toLowerCase();
  const hits = new Set<CookbookSaveOption>();

  const breakfast =
    /breakfast|brunch|pancake|waffle|omelette|omelet|porridge|cereal|idli|dosa|paratha|toast|smoothie bowl|morning/;
  const lunch =
    /lunch|midday|thali|wrap|sandwich|salad bowl|biryani|rice bowl|meal prep/;
  const dinner =
    /dinner|supper|gravy|curry|roast|stew|pasta dinner|night dinner|main course|changezi|butter chicken|dal makhani/;
  const healthy =
    /healthy|low.?cal|low.?fat|high.?protein|protein|keto|vegan|vegetarian|salad|detox|clean.?eat|air.?fry|grilled|no.?oil|weight.?loss|fitness/;

  if (breakfast.test(blob)) hits.add("Breakfast");
  if (lunch.test(blob)) hits.add("Lunch");
  if (dinner.test(blob)) hits.add("Dinner");
  if (healthy.test(blob)) hits.add("Healthy");

  // Time-of-day / meal hashtags common on Reels
  if (/#breakfast\b/.test(blob)) hits.add("Breakfast");
  if (/#lunch\b/.test(blob)) hits.add("Lunch");
  if (/#dinner\b/.test(blob)) hits.add("Dinner");
  if (/#healthy\b|#healthyeating\b/.test(blob)) hits.add("Healthy");

  return COOKBOOK_SAVE_OPTIONS.filter((o) => hits.has(o));
}

/** Map AI recipe tags onto cookbook save options. */
export function cookbookSavesFromTags(tags: string[] | null | undefined): CookbookSaveOption[] {
  if (!tags?.length) return [];
  const lower = tags.map((t) => t.toLowerCase());
  const hits: CookbookSaveOption[] = [];
  for (const opt of COOKBOOK_TAG_CATEGORIES) {
    if (lower.some((t) => t === opt.toLowerCase() || t.includes(opt.toLowerCase()))) {
      hits.push(opt);
    }
  }
  return hits;
}
