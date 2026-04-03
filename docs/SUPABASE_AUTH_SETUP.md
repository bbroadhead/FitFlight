# Supabase Auth Setup

The login screen now uses Supabase email/password auth through:

- `src/lib/supabaseAuth.ts`
- `src/app/login.tsx`

## Frontend env vars

Make sure these are set for the web app:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_APP_URL`

For GitHub Pages, this app URL is correct:

- `https://bbroadhead.github.io/FitFlight/`

The code trims the trailing slash automatically.

## Supabase Auth settings

In Supabase:

1. Enable `Email` under Authentication providers.
2. Set the Site URL to:
   - `https://bbroadhead.github.io/FitFlight/`
3. Add these redirect URLs:
   - `https://bbroadhead.github.io/FitFlight/`
   - `https://bbroadhead.github.io/FitFlight/integrations/strava-callback`
   - your local dev URL too, for example `http://localhost:19008`
4. Decide whether `Confirm email` should be required.

## Recommended secure choice

For better security:

- keep `Confirm email` enabled
- use a real SMTP sender if you want dependable delivery
- optionally restrict signups to `@us.af.mil` in your backend logic later

Current app behavior if confirm email stays enabled:

- signup creates the Supabase auth account
- the app tells the user to check email
- they must confirm the address before signing in

## Important current limitation

Only the login/signup layer is using Supabase right now.

The rest of the app data is still local browser state today:

- members
- attendance
- workouts
- shared workouts
- notifications
- achievements

That means secure auth is now in place at the entry point, but cross-user shared app data still needs a full migration to Supabase tables plus row-level security and mutation APIs before attendance, workouts, and profiles truly stay in sync for everyone.
