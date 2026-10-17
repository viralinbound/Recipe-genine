# Production store + auth URL configuration

Use this checklist so Recipe Genie works on all devices from **Play Store** and **App Store**, including **forgot-password** email → open app → set new password.

## Deep links (already in the app)

| Purpose | URL |
|--------|-----|
| App scheme | `recipegenie` |
| Auth callback (Google) | `recipegenie://auth/callback` |
| Password reset | `recipegenie://auth/reset-password` |
| Android package | `dev.recipegenie.app` |
| iOS bundle id | `dev.recipegenie.app` |
| Supabase project | `https://icvqgxqtqsigbabucbgt.supabase.co` |

## 1. Supabase → Authentication → URL Configuration

**Site URL:**

```
recipegenie://auth/callback
```

**Redirect URLs** — you MUST include reset-password or forgot-password emails fall back to Site URL (`auth/callback`):

```
recipegenie://auth/callback
recipegenie://auth/reset-password
recipegenie://**
https://icvqgxqtqsigbabucbgt.supabase.co/**
```

After saving, request a **new** reset email (old emails still have the wrong `redirect_to`).

### Why Gmail showed `redirect_to=recipegenie://auth/callback`

Supabase only keeps `redirect_to` if that exact URL is in the allow list.
If not, it swaps in **Site URL** → callback. The app now always sends
`recipegenie://auth/reset-password`, and `auth/callback` also forwards
recovery sessions to the reset screen as a safety net.

## 2. Supabase → Authentication → Emails

- Confirm **Reset Password** template is enabled.
- The link must keep Supabase’s verify URL; it will redirect to  
  `recipegenie://auth/reset-password` (sent by the app as `redirectTo`).

## 3. Forgot password flow (end user)

1. App → Login → Forgot password → enter email  
2. Inbox → tap reset link  
3. Phone opens **Recipe Genie** on **Set a new password**  
4. Enter + confirm password → Save → signed into the app  

If the link opens a browser instead of the app, the redirect URL is missing from Supabase allow list, or the store build isn’t installed.

## 4. Google OAuth (optional)

Supabase → Authentication → Providers → Google:

- Authorized redirect URI (Google Cloud Console):  
  `https://icvqgxqtqsigbabucbgt.supabase.co/auth/v1/callback`
- Supabase redirect allow list must include `recipegenie://auth/callback`

## 5. Production builds (EAS)

```bash
# Android Play Store (.aab)
npx eas-cli build --platform android --profile production

# iOS App Store
npx eas-cli build --platform ios --profile production
```

Submit:

```bash
npx eas-cli submit --platform android --profile production
npx eas-cli submit --platform ios --profile production
```

Fill `eas.json` → `submit.production.ios` (`appleId`, `ascAppId`, `appleTeamId`) and place `google-service-account.json` for Play (or submit manually in consoles).

## 6. Store console deep-link notes

- **Play Console**: package `dev.recipegenie.app`; custom scheme handled via Android intent filters in `app.json`.
- **App Store Connect**: bundle `dev.recipegenie.app`; URL scheme `recipegenie` registered in Info.plist via Expo.

## 7. Test before release

1. Install a **production** or **preview** build (not only Expo Go).  
2. Forgot password → open email on the same device.  
3. Confirm app opens reset screen and password update succeeds.  
4. Schedule a meal and confirm a notification fires.  
