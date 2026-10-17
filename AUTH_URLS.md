# Auth URL fix (Google + Signup + Forgot password)

All three flows must use the **custom scheme** so the installed app opens.

## Paste in Supabase → Authentication → URL Configuration

**Site URL**
```
recipegenie://auth/callback
```

**Redirect URLs** (add all of these — required)
```
recipegenie://auth/callback
recipegenie://auth/reset-password
recipegenie://**
https://icvqgxqtqsigbabucbgt.supabase.co/auth/v1/callback
https://icvqgxqtqsigbabucbgt.supabase.co/**
```

If any of these are missing, Supabase replaces your `redirect_to` with Site URL and Google / signup / reset break.

## What each flow uses now

| Flow | `redirectTo` / `emailRedirectTo` |
|------|-----------------------------------|
| Google Sign-In | `recipegenie://auth/callback` |
| New user signup (confirm email) | `recipegenie://auth/callback` |
| Forgot password | `recipegenie://auth/reset-password` |

## Google Cloud Console (OAuth client)

Authorized redirect URI:
```
https://icvqgxqtqsigbabucbgt.supabase.co/auth/v1/callback
```

(Do **not** put `recipegenie://` in Google Cloud — only in Supabase.)

## After changing Supabase URLs

1. Save Redirect URLs in Supabase  
2. Reload / rebuild the app  
3. Test **new** Google sign-in, **new** signup email, **new** reset email  
   (old emails keep the old wrong `redirect_to`)

## Expo Go (your current setup: exp://10.20.57.42:8081)

Also add to Redirect URLs:
```
exp://**
```

In Expo Go the app sends:
- Google / signup → `exp://10.20.57.42:8081/--/auth/callback`
- Forgot password → `exp://10.20.57.42:8081/--/auth/reset-password`

Store builds still use `recipegenie://…`.
