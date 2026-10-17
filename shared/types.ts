export type SourceType =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "blog"
  | "manual";

export interface Ingredient {
  item: string;
  // The import/make-healthy edge functions store amounts as { amount, unit };
  // older/manual recipes may instead use { quantity, notes }. Support both.
  amount?: string;
  unit?: string;
  quantity?: string;
  notes?: string;
}

export interface InstructionStep {
  step: number;
  text: string;
}

export interface Recipe {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  ingredients: Ingredient[];
  instructions: InstructionStep[];
  prep_time: number | null; // minutes
  cook_time: number | null; // minutes
  servings: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  cuisine: string | null;
  hero_image: string | null;
  source_url: string | null;
  source_type: SourceType | null;
  tags: string[];
  is_favorite: boolean;
  chef_notes: string | null;
  tips: string[] | null;
  raw_transcript: string | null;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  created_at: string;
}

export interface RecipeCollection {
  recipe_id: string;
  collection_id: string;
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface MealSlot {
  meal: "Breakfast" | "Lunch" | "Snack" | "Dinner";
  recipe_title: string;
  recipe_id: string | null;
  quick_prep_note: string;
}

export interface MealPlanDay {
  day: string; // Mon, Tue, ...
  meals: MealSlot[];
}

export interface MealPlan {
  days: MealPlanDay[];
  shopping_list: { item: string; quantity?: string; checked?: boolean }[];
  prep_tips: string[];
}

export interface HealthyVersionResult {
  recipe: Partial<Recipe>;
  calorie_reduction_percent: number;
  health_benefits: string[];
}

export interface ScheduledMeal {
  id: string;
  user_id: string;
  recipe_id: string;
  recipe_title: string;
  scheduled_date: string; // YYYY-MM-DD
  prep_time: number; // minutes
  cook_time: number; // minutes
  start_cooking_time: string; // ISO timestamp
  target_eating_time: string; // ISO timestamp
  reminder_offset: number; // minutes before start_cooking_time
  notification_id: string | null;
  calendar_event_id: string | null;
  notes: string | null;
  /** Breakfast | Lunch | Snack | Dinner when set */
  meal_type?: string | null;
  created_at: string;
}
