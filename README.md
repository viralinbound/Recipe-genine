# CookPilot

AI recipe-import app. Paste a link, get a saved recipe. React Native (Expo) + Supabase +
OpenAI, no custom backend server.

## What's in this package

```
cookpilot-app/
  app/                    ← screens (Expo Router file-based routing)
  hooks/                  ← React Query hooks (auth, recipes, collections, import/AI)
  lib/                    ← Supabase client + React Query client
  stores/                 ← Zustand auth store
  shared/types.ts         ← shared TypeScript types
  scripts/patch-expo-router.js
  supabase/
    migrations/0001_init.sql        ← full DB schema + RLS + storage bucket policies
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
cd cookpilot-app
npm install
```

You'll also want the Expo/EAS CLIs available:

```bash
npm install -g eas-cli
```

## 2. Set up Supabase

The app is already pointed at your existing project
(`reluivrkopuxckuthiqd`, anon key wired into `lib/supabase.ts` — this key is safe to expose
by design, RLS enforces access).

**Apply the schema.** In the Supabase dashboard → SQL Editor, paste and run
`supabase/migrations/0001_init.sql`. This creates:
- `profiles`, `recipes`, `collections`, `recipe_collections` tables
- Row Level Security policies so each user only sees their own data
- A trigger that auto-creates a `profiles` row on signup
- The `avatars` storage bucket with public-read / owner-write policies

If you're using the Supabase CLI instead:

```bash
supabase login
supabase link --project-ref reluivrkopuxckuthiqd
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
(`cookpilot://auth/callback` in dev, plus your production scheme).

## 3. Run it locally

```bash
npx expo start
```

Scan the QR code with Expo Go (SDK 51), or press `i` / `a` for a simulator/emulator.

Log in with the demo account if you seeded one (`demo@cookpilot.dev` / `demo1234`), or sign up
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
- Collections have a DB table and hooks (`useCollections`) but no dedicated management UI yet.
- Push notifications aren't wired up (`expo-notifications` isn't installed).
- TikTok is intentionally not a supported import source.
- `Loader2`-style CSS spin animations don't work on native — screens use `ActivityIndicator`
  instead.

## Environment / secrets

Nothing sensitive lives in the repo. The Supabase anon key in `lib/supabase.ts` is meant to be
public. The only real secret is `OPENAI_API_KEY`, which stays server-side in Supabase's Edge
Function secrets — never put it in the mobile app.
