# Supabase Strava Setup

This app now expects four Supabase Edge Functions:

- `strava-connect`
- `strava-exchange`
- `strava-sync`
- `strava-disconnect`

The frontend files that use them are:

- `src/lib/strava.ts`
- `src/app/integrations/strava-callback.tsx`
- `src/app/(tabs)/profile.tsx`

## 1. Create a Supabase project

Create a new Supabase project and copy:

- `Project URL`
- `anon public key`
- `service role key`

## 2. Create the Strava tables

Run the SQL in:

- `supabase/sql/strava.sql`

This creates:

- `public.strava_connections`
- `public.strava_activity_imports`

## 3. Create a Strava developer app

In Strava, create an API application and note:

- `Client ID`
- `Client Secret`

Set the authorization callback URL to your deployed app callback route:

- local example: `http://localhost:19008/integrations/strava-callback`
- GitHub Pages example: `https://<owner>.github.io/<repo>/integrations/strava-callback`

## 4. Set Supabase Edge Function secrets

Set these secrets in Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`

If your Supabase project UI blocks the `SUPABASE_` prefix, this repo also accepts:

- `BACKEND_URL`
- `BACKEND_SERVICE_ROLE_KEY`

## 5. Deploy the Edge Functions

Deploy the function folders in:

- `supabase/functions/strava-connect`
- `supabase/functions/strava-exchange`
- `supabase/functions/strava-sync`
- `supabase/functions/strava-disconnect`

The shared helper file is:

- `supabase/functions/_shared/strava.ts`

## 6. Set frontend environment variables

Add these to your web app environment:

- `EXPO_PUBLIC_APP_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Optional:

- `EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL`

If `EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL` is omitted, the app defaults to:

- `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1`

Examples:

```env
EXPO_PUBLIC_APP_URL=http://localhost:19008
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

GitHub Pages example:

```env
EXPO_PUBLIC_APP_URL=https://<owner>.github.io/<repo>
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 7. Important current limitation

This app still uses local persisted login/state in the frontend, not Supabase Auth.

That means the current Strava integration is good for:

- a pilot rollout
- your current web app architecture
- importing workouts into the signed-in browser session

But for stronger production security, you should eventually move user auth to Supabase Auth and identify Strava connections by a verified Supabase user ID instead of the current local app user ID.

## 8. What the app does now

- `Connect` sends the user to Strava through `strava-connect`
- the callback route calls `strava-exchange`
- imported workouts are normalized and saved into the app's local persisted store
- `Sync now` calls `strava-sync`
- `Disconnect` calls `strava-disconnect`
