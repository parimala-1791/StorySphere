# Story Sphere

Story Sphere is a community storytelling platform where readers discover writing and authors share personal, imaginative, and community stories.

> Every Story Deserves a Space. Every Voice Deserves to Be Heard.

The product is being developed in phases. The React/Vite shell, initial Supabase database and Storage migrations, email/password authentication flows, and account profile editing are in place. A Supabase project is not yet configured in this workspace, so live authentication and database operations have not been verified here.

## Objectives

- Give writers a welcoming place to draft, publish, and manage long-form stories.
- Help readers discover stories by topic, author, and popularity.
- Build respectful community interactions around stories and writers.
- Protect user data and moderation operations with Supabase Auth, PostgreSQL RLS, and trusted admin roles.

## Feature status

- **Implemented foundation:** responsive lavender design system, open-book Story Sphere identity, Supabase client, email/password sign-up and sign-in, session restoration, protected account routes, logout, and account profile editing with avatar upload.
- **Implemented discovery, reading, and writing experiences:** data-driven Home and Explore pages; a story reader with author/categories/tags, signed cover images, comments, likes, bookmarks, sharing, related stories, and reading-history recording; and an authenticated writing workspace for drafts, editing, previews, publishing, deletion, multi-category/tag selection, and private cover uploads.
- **Implemented community experiences:** public writer profiles with published stories and follow controls; an owner-scoped dashboard with story, engagement, follow, bookmark, and reading-history data; and private notifications with read-state updates.
- **Database foundation:** versioned migrations for the application schema, RLS, interaction notification triggers, role-checked moderation functions, Storage buckets/policies, and public story-feed RPCs.
- **Implemented administration:** an RPC-gated admin workspace for platform statistics, report review, story moderation and featuring, account listing/suspension, and category management. User account administration runs through a Supabase Edge Function; database RLS and checked RPCs remain authoritative.
- **Upcoming:** additional launch hardening and end-to-end testing against a configured Supabase project.

Authentication, profile, discovery, reading, writing, dashboard, community, and administration operations require a configured Supabase project and applied migrations. Account suspension additionally requires the `admin-user-management` Edge Function to be deployed. This workspace has not been connected to a project, so live data behavior is not yet verified. Until configuration is present, auth submission is disabled and data pages show explicit errors. Unfinished routes are marked as in progress rather than presenting fake successful actions.

## Technology

- React, Vite, JavaScript, HTML, and CSS.
- React Router DOM for client-side routing.
- Lucide React for interface icons.
- Supabase Auth, PostgreSQL, Row Level Security, and Storage.
- Supabase Edge Functions handle trusted account-management operations that require server-side credentials. There is no separate Express/Node backend.

## Architecture

The browser application uses a single Supabase client initialized from Vite environment variables. `AuthProvider` restores the Supabase session and shares it with protected routes and navigation. Email confirmation returns to `/auth/callback`; the provider exchanges PKCE codes, verifies token-hash links, and accepts existing implicit-flow token fragments before marking authentication complete. Confirmation failures offer a resend form. Sign-up provisions a profile through a database trigger; profile editing uses owner-scoped database and Storage policies. Home and Explore query published stories through a role-safe RPC, with search data indexed in PostgreSQL. The reader queries published story content under RLS, writes likes, bookmarks, comments, and reports through authenticated client operations guarded by unique constraints and policies. The writing workspace edits only the authenticated author's stories, assigns existing categories and tags, and uploads covers to the private bucket under Storage policies. Public writer profiles use a bounded published-story RPC; follow and notification changes are subject to database policies and unique constraints. Dashboard queries are restricted to the signed-in user's stories and activity by RLS. Reading history is recorded through a role-checked RPC. The admin route checks a trusted `is_admin()` RPC for navigation, while every privileged database mutation rechecks the role inside RLS or a `SECURITY DEFINER` RPC. Account listing and suspension use a Supabase Edge Function that verifies the caller's JWT and admin role before using server-only Auth Admin credentials. Database RLS is the authorization boundary. Supabase migrations under `supabase/migrations/` version the schema, functions, policies, and Storage setup. Trusted admin roles are stored outside user-editable profile data.

The story-cover bucket is private so unpublished draft covers are not publicly downloadable. Public stories will use authorized signed URLs. Profile pictures are in a public bucket because they are part of public profiles; uploads and replacements are restricted to the owning user's storage folder.

## Database structure

The initial migrations create:

- `profiles`, linked one-to-one with Supabase Auth users.
- `stories`, linked to an author and optional category; stories have draft, published, and archived states.
- `categories`, `story_categories`, `tags`, and `story_tags` for multi-category and tag organization. The legacy `stories.category_id` field remains as a compatibility value.
- `likes`, `comments`, `bookmarks`, and `follows` for community interactions.
- `notifications` generated for likes, comments, and follows.
- `reports` for moderation review.
- `reading_history` for per-user reading activity.
- `private.user_roles` for trusted admin assignments.
- `get_story_feed` and `get_story_feed_v2`, public-only RPCs for full-text search, category filtering, recent/popular ordering, and bounded pagination. The versioned RPC returns every category assigned to a story.
- `get_profile_story_feed` and `get_profile_story_feed_v2`, public-only RPCs that return published stories for one writer with engagement totals, all assigned categories, and bounded pagination.
- `is_user_admin`, an RPC executable only by `service_role`, used by the trusted account-management Edge Function to protect administrator accounts from suspension.

Foreign keys, uniqueness rules, validation constraints, timestamps, and query indexes are included. User-owned records are protected with RLS; admin moderation uses role-checked database functions. Trending order counts likes, comments, and readers active during the last 30 days.

## Folder structure

```text
src/
  auth/             Authentication provider and hook
  components/       Shared brand and layout components
  lib/              Supabase browser client
  pages/            Routed auth, account, discovery, reader, writer, community, and admin experiences
  services/         Supabase feed, reader, writer, community, reporting, and admin operations
  styles/           Lavender design tokens and global styles
supabase/
  config.toml
  functions/        Trusted Edge Functions for Auth Admin operations
  migrations/       Versioned schema, RLS, and Storage setup
```

## Installation

Requirements: Node.js and npm. A Supabase project is needed for connected authentication and data features.

```sh
npm install
```

Copy `.env.example` to `.env.local` and set the variables below. `.env.local` is ignored by Git.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Only the project URL and publishable/anon key belong in frontend configuration. Never put a Supabase service-role key in a `VITE_` variable, source file, or browser bundle. Admin-only Auth operations that need a service-role key must run in a trusted Supabase Edge Function.

Start the app:

```sh
npm run dev
```

Check the production bundle and lint:

```sh
npm run build
npm run lint
```

## Supabase setup

1. Create a Supabase project and keep email confirmation enabled under **Authentication → Providers → Email**.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
3. In **Authentication → URL Configuration**, set the Site URL to the app’s origin and add each callback URL to Redirect URLs. For local development allow `http://localhost:5173/auth/callback` and, if you open Vite by IP, `http://127.0.0.1:5173/auth/callback`; add `https://YOUR_PRODUCTION_HOST/auth/callback` for production. Supabase must allow the exact callback URL sent by the app.
4. Keep the confirmation email template’s link pointed at Supabase’s `{{ .ConfirmationURL }}` so the configured redirect is honored.
5. Install the Supabase CLI and Docker Desktop to run the local Supabase stack, then use `supabase start` and `supabase db reset` to apply and test migrations locally; alternatively, link the CLI to your own project and apply migrations there.
6. For an existing database, apply `20261120225400_add_multiple_story_categories.sql` once after the existing schema migrations, then apply `20261121015200_fix_story_category_rls_recursion.sql` once. The second migration fixes category-policy recursion without changing category assignments. Do not rerun or edit the older migration files.
7. Create an initial administrator only from the trusted Supabase SQL Editor after registering that account:

   ```sql
   insert into private.user_roles (user_id, role)
   values ('AUTH_USER_UUID', 'admin');
   ```

Never expose or paste a service-role key into this repository. Do not assign roles from the public client.

After applying migrations, run the security contract checks from a PostgreSQL session connected to the local Supabase database:

```sh
psql -v ON_ERROR_STOP=1 -f supabase/tests/security_contract.sql
```

Deploy the account-management function after linking your Supabase project:

```sh
supabase functions deploy admin-user-management
```

The function uses Supabase-provided server environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`). If your deployment does not provide these automatically, configure them as Edge Function secrets in Supabase. Never add the service-role key to `.env.local` or any `VITE_` variable. The administrator user list and suspension controls remain unavailable until this function is deployed.

Suspending an account blocks new sign-ins and token refreshes through Supabase Auth. Already-issued access tokens can remain valid until they expire, so suspension is not an instantaneous revocation of every active request.

## Screenshots

Screenshots are pending capture after the application is connected to a Supabase project with published stories.

## Future enhancements

- Rich-text editing and autosave.
- Search ranking and personalized recommendations.
- Email notifications and moderation audit history.
- Additional accessibility, performance, and abuse-prevention improvements.
