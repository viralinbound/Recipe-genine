# Recipe Genie

AI recipe-import app. Paste a link, get a saved recipe. React Native (Expo) + Supabase +
OpenAI, no custom backend server.

## What's in this package

```
recipe-genie-app/
  app/                    ← screens (Expo Router file-based routing)
    schedule/[id].tsx      ← meal scheduler UI (pick date/time, set reminder)
    (tabs)/scheduled.tsx   ← "Reminders" tab: manage scheduled meals
  hooks/                  ← React Query hooks (auth, recipes, collections, import/AI, scheduling)
  lib/                    ← Supabase client, React Query client, notifications, calendar
  stores/                 ← Zustand auth store
  shared/types.ts         ← shared TypeScript types
  scripts/patch-expo-router.js
  supabase/
    migrations/0001_init.sql        ← full DB schema + RLS + storage bucket policies
    migrations/0002_scheduled_meals.sql ← scheduled_meals table + RLS
    functions/import-recipe/index.ts
    functions/make-healthy/index.ts
    functions/meal-planner/index.ts
  app.json, eas.json, package.json, tsconfig.json, babel.config.js
```

This is the full app referenced in your spec — same architecture, same table/column names,
same Edge Function names, same file structure under `app/`, `hooks/`, `lib/`, `stores/`,
`shared/`, `scripts/`.

## 1. Install dependencies

```bash
cd recipe-genie-app
npm install
```

You'll also want the Expo/EAS CLIs available:

```bash
npm install -g eas-cli
```

## 2. Set up Supabase

The app is pointed at project `icvqgxqtqsigbabucbgt` (`tools@viralinbound.in's Project`,
anon key wired into `lib/supabase.ts` — this key is safe to expose by design, RLS enforces
access). Schema, RLS policies, and Edge Functions have already been applied to this project.

**If you ever need to reapply the schema** (e.g. a fresh project): in the Supabase dashboard →
SQL Editor, run `supabase/migrations/0001_init.sql` through `0005_revoke_public_execute_handle_new_user.sql`
in order. This creates:
- `profiles`, `recipes`, `collections`, `recipe_collections`, `scheduled_meals` tables
- Row Level Security policies so each user only sees their own data
- A trigger that auto-creates a `profiles` row on signup
- The `avatars` storage bucket with public-read / owner-write policies

If you're using the Supabase CLI instead:

```bash
supabase login
supabase link --project-ref icvqgxqtqsigbabucbgt
supabase db push
```

**Set the OpenAI key.** Dashboard → Project Settings → Edge Functions → Secrets:

```
OPENAI_API_KEY=sk-...
```

**Deploy the Edge Functions:**

```bash
supabase functions deploy import-recipe
supabase functions deploy make-healthy
supabase functions deploy meal-planner
```

**Enable Google OAuth (optional, for "Continue with Google"):** Dashboard → Authentication →
Providers → Google, add your OAuth client ID/secret, and add the redirect URL Expo generates
(`recipegenie://auth/callback` in dev, plus your production scheme).

## 3. Run it locally

```bash
npx expo start
```

Scan the QR code with Expo Go (SDK 51), or press `i` / `a` for a simulator/emulator.

Log in with the demo account if you seeded one (`demo@recipegenie.dev` / `demo1234`), or sign up
fresh — a `profiles` row is created automatically via the DB trigger.

## 4. Build for real devices (EAS)

Always build from this folder (not a monorepo) to avoid workspace-hoisting issues with
`expo-router`.

```bash
npx eas-cli@latest whoami            # confirm you're logged into the `gunkaur` Expo account
npx eas-cli@latest build --platform android --profile preview --non-interactive
```

That produces an installable APK for internal testing without a Play Store account.

For production:

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production   # needs an Apple Developer account
```

Fill in `eas.json` → `submit.production.ios` (`appleId`, `ascAppId`, `appleTeamId`) before
submitting to App Store Connect.

## How the import pipeline works

1. App calls the `import-recipe` Edge Function with the user's JWT + the pasted URL.
2. Function verifies the user via Supabase auth.
3. YouTube links → oEmbed + a best-effort scrape of the video description.
   Blog/Instagram links → fetches the page, prefers `@type: Recipe` JSON-LD if present,
   otherwise falls back to stripped body text (truncated to stay under token limits).
4. Sends the extracted text to `gpt-4o-mini` in JSON mode (`max_tokens: 4096`).
5. Repairs truncated JSON via bracket balancing if the model got cut off.
6. If the model returns `{"error": "no_recipe"}`, the app shows a friendly "this doesn't
   look like a recipe page" message.
7. Otherwise the recipe is inserted into `recipes` and the app navigates to the detail screen.

## Known limitations (carried over from the spec)

- YouTube import relies on the video description, not a real transcript — some videos won't
  have enough text for a good extraction.
- TikTok is intentionally not a supported import source.
- `Loader2`-style CSS spin animations don't work on native — screens use `ActivityIndicator`
  instead.

## Collections

From the Cookbook tab, the "Collections" row lets you create named, emoji-tagged folders
(e.g. "Weeknight dinners") and tap into one to see the recipes saved there. From any recipe's
detail screen, **Save to collection** opens a picker to add/remove that recipe from any
collection, or create a new one on the spot. Deleting a collection only removes the folder —
the recipes themselves stay in your cookbook.

## Recipe Meal Scheduler and Reminder

Two ways in:
- From a recipe's detail screen, tap **Schedule this meal** (recipe is pre-filled).
- From the **Reminders** tab, tap **+** to start fresh — pick a saved recipe from a searchable
  list, or paste a new link to import one on the spot (reuses the same import pipeline as the
  Add tab) before continuing.

The scheduling screen shows a full month calendar (`react-native-calendars`) where you can tap
**multiple dates** to schedule the same recipe repeatedly (e.g. every Mon/Wed/Fri), plus one
eating time that applies to all of them. For each selected date the app computes
`Cooking Start Time = Target Eating Time − (Prep Time + Cook Time)` and lets you set how many
minutes before that to be reminded (default 15) — the preview list shows the reminder/cooking-
start time for every date you picked.

On scheduling, the app does this once per selected date:
1. Schedules a local exact notification (`expo-notifications`, Android `AlarmManager` under
   the hood) with a message built from the recipe title, total prep+cook duration, and target
   eating time.
2. Adds a calendar event (`expo-calendar` → `CalendarContract.Events` on Android) spanning
   cooking-start to eating time.
3. Saves the schedule to the `scheduled_meals` table in Supabase (`recipe_id`, `recipe_title`,
   `scheduled_date`, `prep_time`, `cook_time`, `start_cooking_time`, `target_eating_time`,
   `reminder_offset`, plus the OS notification id and calendar event id so they can be
   cancelled later).

The **Reminders** tab lists all scheduled meals and lets you cancel one, which removes the
notification, the calendar event, and the DB row together. Because the schedule lives in
Supabase (not just on-device), it survives app restarts and reinstalls, though the OS-level
notification/calendar entries are device-local and only exist on the device that created them.

Requires `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`, and
`READ_CALENDAR`/`WRITE_CALENDAR` permissions (declared in `app.json` → `android.permissions`
and requested at runtime); the user is prompted for calendar/notification access the first
time they schedule a meal.

## Environment / secrets

Nothing sensitive lives in the repo. The Supabase anon key in `lib/supabase.ts` is meant to be
public. The only real secret is `OPENAI_API_KEY`, which stays server-side in Supabase's Edge
Function secrets — never put it in the mobile app.
