# Supabase Migration Notes

This folder now holds the Supabase-first database foundation for the platform.

## Current status

- `migrations/20260310_200000_initial_platform_schema.sql` defines the first Postgres schema for the Next.js + Supabase migration.
- `seed.sql` ports the existing reference/bootstrap data from the Python seed script into idempotent SQL for Supabase.
- The schema mirrors the current FastAPI/SQLAlchemy domain model closely enough to support staged backend replacement.
- `public.users` is linked to `auth.users` by UUID so Supabase Auth can replace the custom JWT system.

## Important design choices

- Auth users are stored in `auth.users`; application profile data lives in `public.users`.
- Most business tables keep numeric identity keys to minimize churn in the existing domain model.
- Storage buckets are not created in this first migration yet.
- RLS policies are intentionally deferred until the route-handler migration is further along.
- No default auth user is inserted by `seed.sql`; create Supabase Auth users through the dashboard, Admin API, or your app flow.

## Applying the seed

1. Apply the migration in `migrations/`.
2. Run `seed.sql` in Supabase SQL Editor or through the Supabase CLI.
3. Create at least one Supabase Auth user with app metadata role `Admin` if you want immediate admin access.

## Planned next steps

1. Add storage bucket setup for uploaded reports and generated exports.
2. Switch the app auth flow from legacy backend JWTs to Supabase sessions.
3. Replace the next FastAPI module with Next.js route handlers backed by Supabase.
4. Add RLS policies once app behavior is stable.
