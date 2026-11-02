# SplitCue Pro — External Setup Guide

Everything the app code needs from the outside world to make auth, subscriptions, cloud sync, and AI work.

---

## 1. Supabase Auth Providers

### Apple Sign-In
1. Go to **Supabase Dashboard → Authentication → Providers → Apple**
2. Enable it
3. Create a **Service ID** in the Apple Developer Console
4. Add the Supabase callback URL as a redirect URI
5. In Xcode: enable the **Sign in with Apple** capability on the main target
6. Add `expo-apple-authentication` to `app.config.ts` plugins if needed

### Google Sign-In
1. Go to **Google Cloud Console → APIs & Services → Credentials**
2. Create an **OAuth 2.0 Client ID** (iOS type) with your bundle ID
3. Create another one (Web type) for the Supabase redirect flow
4. Go to **Supabase Dashboard → Authentication → Providers → Google**
5. Enable it, paste the Web client ID and secret
6. Set the redirect URL in Supabase to match your app's deep link scheme:
   - Production: `pacecue://auth/callback`
   - Development: `pacecue-dev://auth/callback`

### Email OTP
1. Go to **Supabase Dashboard → Authentication → Providers → Email**
2. Enable it (should be enabled by default)
3. Under **Email Templates**, customize the OTP template if desired

---

## 2. Supabase Database Tables

Run these SQL statements in the **Supabase SQL Editor**:

```sql
-- ── Default privileges ──────────────────────────────────────
-- Automatically grant table permissions to authenticated/anon roles
-- for every table created in the public schema (now and in the future).
-- Without these, RLS policies alone are not enough — queries will fail
-- with "permission denied for table".

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant select on tables to anon;

-- ── Profiles (auto-created on user signup via trigger) ──────

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  ai_workouts_this_month int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Running Profiles ────────────────────────────────────────

create table if not exists running_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null unique,
  experience_level text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  typical_run_minutes int,
  easy_pace numeric,  -- min/mile
  fast_pace numeric,  -- min/mile
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table running_profiles enable row level security;
create policy "Users own their running profile"
  on running_profiles for all using (auth.uid() = user_id);

-- ── Running Preferences ─────────────────────────────────────

create table if not exists running_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  content text not null,
  category text not null check (category in ('goal', 'preference', 'general')),
  created_at timestamptz not null default now()
);

alter table running_preferences enable row level security;
create policy "Users own their preferences"
  on running_preferences for all using (auth.uid() = user_id);

-- ── Subscriptions ───────────────────────────────────────────

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null unique,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  status text not null default 'active' check (status in ('trialing', 'active', 'canceled', 'expired', 'past_due')),
  provider text check (provider in ('apple', 'google', 'stripe', 'manual')),
  provider_subscription_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;
create policy "Users can read own subscription"
  on subscriptions for select using (auth.uid() = user_id);

-- ── AI Generations (for metering) ───────────────────────────

create table if not exists ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  prompt text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

alter table ai_generations enable row level security;
create policy "Users can read own AI generations"
  on ai_generations for select using (auth.uid() = user_id);
create policy "Users can insert own AI generations"
  on ai_generations for insert with check (auth.uid() = user_id);

-- ── AI Conversations (chat persistence) ─────────────────────

create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  title text not null default 'New Conversation',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ai_conversations_user_id on ai_conversations(user_id);
create index idx_ai_conversations_updated_at on ai_conversations(updated_at desc);

alter table ai_conversations enable row level security;
create policy "Users can read own conversations"
  on ai_conversations for select using (auth.uid() = user_id);
create policy "Users can insert own conversations"
  on ai_conversations for insert with check (auth.uid() = user_id);
create policy "Users can update own conversations"
  on ai_conversations for update using (auth.uid() = user_id);
create policy "Users can delete own conversations"
  on ai_conversations for delete using (auth.uid() = user_id);

-- ── Cloud Workouts (sync) ───────────────────────────────────

create table if not exists cloud_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  workout_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, workout_id)
);

alter table cloud_workouts enable row level security;
create policy "Users own their cloud workouts"
  on cloud_workouts for all using (auth.uid() = user_id);

-- ── Cloud History (sync) ────────────────────────────────────

create table if not exists cloud_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  history_id text not null,
  data jsonb not null,
  completed_at timestamptz not null,
  deleted_at timestamptz,
  unique(user_id, history_id)
);

alter table cloud_history enable row level security;
create policy "Users own their cloud history"
  on cloud_history for all using (auth.uid() = user_id);

-- ── RPC: Increment AI usage counter ────────────────────────

create or replace function increment_ai_workouts(p_user_id uuid)
returns void as $$
begin
  update profiles
  set ai_workouts_this_month = ai_workouts_this_month + 1,
      updated_at = now()
  where id = p_user_id;
end;
$$ language plpgsql security definer;

revoke execute on function increment_ai_workouts(uuid) from public, anon, authenticated;
grant execute on function increment_ai_workouts(uuid) to service_role;

```

---

## 3. RevenueCat Setup

### Create Project
1. Sign up at [revenueCat.com](https://www.revenuecat.com/)
2. Create a new project for SplitCue
3. Add an **iOS app** (bundle ID: `com.toddly.runningintervals`)
4. Add an **Android app** if applicable

### Configure Products
1. In **App Store Connect** → your app → **Subscriptions**:
   - Create a subscription group (e.g. "SplitCue Pro")
   - Add a **Monthly** product (e.g. `pacecue_pro_monthly` at $3.99/mo)
   - Add an **Annual** product (e.g. `pacecue_pro_annual` at $29.99/yr)
   - Optionally add a 7-day free trial to both
2. In RevenueCat → **Products**, import these products
3. Create an **Offering** with both packages
4. Create an **Entitlement** called `pacecue_pro`
5. Attach both products to the entitlement

### API Keys
1. In RevenueCat → **API Keys**, copy the **public iOS API key**
2. Create `.env` in project root:
   ```
   EXPO_PUBLIC_REVENUE_CAT_KEY=appl_xxxxxxxxxxxx
   ```

### Webhook (Subscription Sync)
1. In RevenueCat → **Integrations → Webhooks**
2. Point it at a Supabase Edge Function URL:
   `https://oakhqqrxsavmoeqlzcny.supabase.co/functions/v1/revenuecat-webhook`
3. Create the edge function (see section 4 below)

---

## 4. Supabase Edge Functions

You need two edge functions. Create them with:
```bash
supabase functions new generate-workout
supabase functions new revenuecat-webhook
```

### `generate-workout`
Receives the user's prompt + profile context, calls an LLM, returns a `WorkoutDefinition`.

**Secrets needed:**
```bash
supabase secrets set OPENAI_API_KEY=sk-...
# or ANTHROPIC_API_KEY=sk-ant-...
```

**Expected request body:**
```json
{
  "prompt": "30 minute tempo run with warmup",
  "profile": {
    "experience_level": "intermediate",
    "typical_run_minutes": 30,
    "easy_pace": 9.5,
    "fast_pace": 7.0
  },
  "goals": ["Train for a 10K"],
  "preferences": ["Keep workouts under 45 minutes"],
  "conversation": [{ "role": "user", "content": "..." }],
  "history_summary": "47 total workouts | 3 this week | 12 this month | avg 3.5/week\nLast workout: \"5K Speed\" (1d ago)\nRecent: Tempo Run (3d ago), Easy 30 Min (5d ago), Hill Repeats (6d ago)\nLast 30d by type: speed ×4, tempo ×3, easy ×5, hills ×2\nAvg duration: 38 min (7d) / 35 min (30d)\nHard interval effort avg: 7.2/10 | Best hard pace: 7:15/mi"
}
```

**Expected response:**
```json
{
  "message": "Here's a 30-minute tempo workout...",
  "workout": {
    "name": "30-Min Tempo Run",
    "warmup": [{ "intervals": [...], "repeatCount": 1 }],
    "blocks": [{ "intervals": [...], "repeatCount": 3 }],
    "cooldown": [{ "intervals": [...], "repeatCount": 1 }]
  }
}
```

The workout intervals should match the `WorkoutInterval` type:
```ts
{ type: 'hard' | 'easy' | 'warmup' | 'cooldown', durationSeconds: number, label?: string, effort?: number, targetPace?: number }
```

**Important:** `effort` and `targetPace` are mutually exclusive per interval.
Each interval should have at most one — either an effort rating (1–10 RPE) or a
target pace (min/mile), never both. If the user's profile includes pace data, prefer
`targetPace` for hard/tempo intervals. Otherwise default to `effort`. The client
will strip `targetPace` if both are returned on the same interval.

**Coaching with history:** The `history_summary` field is a pre-serialized text
block summarizing the user's completed workout history. It is `null` when the user
has no history. When present, inject it into the system prompt so the AI can act
as a coach. Example system prompt section:

```
## Runner's Recent History
{history_summary}

Use this history to guide your recommendation:
- Suggest a workout TYPE they haven't done recently (e.g. hills if they've only done speed work)
- If they've worked out 5+ days this week or done several hard sessions in a row, suggest recovery/easy
- If daysSinceLastWorkout > 7, ease them back in with a lighter session
- Consider progressive overload if volume/intensity has been consistent
- Reference their actual history in your message (e.g. "Since your last 3 workouts were speed-focused…")
```

### `revenuecat-webhook`
Receives RevenueCat webhook events and upserts the `subscriptions` table.

Handle these event types:
- `INITIAL_PURCHASE` → insert/update subscription with `status: 'active'`, `tier: 'pro'`
- `RENEWAL` → update `current_period_start/end`, keep `status: 'active'`
- `CANCELLATION` → set `status: 'canceled'`, `canceled_at`
- `EXPIRATION` → set `status: 'expired'`

Use the RevenueCat webhook secret to verify authenticity.

---

## 5. App Store Connect

### In-App Purchases
1. Create subscription products (see RevenueCat section above)
2. Set up a **Sandbox tester** account for testing IAP

### App Review Notes
When submitting, include a note about:
- The app works without an account (core features are free)
- Subscription unlocks AI workout builder + unlimited usage
- How to test: create account, use AI builder

---

## 6. Privacy & Legal

Before launching, create these pages:
- **Terms of Use**: `https://www.brandonharding.dev/pacecue/terms`
- **Privacy Policy**: `https://www.brandonharding.dev/pacecue/privacy`

The privacy policy should cover:
- Supabase auth (email storage)
- Cloud sync (workout data storage)
- Anonymous analytics (existing `events` table)
- AI usage (prompts sent to LLM provider)

---

## 7. Environment Variables

Create `.env` in the project root:
```
EXPO_PUBLIC_REVENUE_CAT_KEY=appl_xxxxxxxxxxxx
```

The Supabase URL and anon key are already hardcoded in `supabaseClient.ts`.

---

## Quick Checklist

- [ ] Enable Apple + Google auth providers in Supabase
- [ ] Run all SQL migrations in Supabase SQL Editor
- [ ] Create RevenueCat project + products + entitlement
- [ ] Set `EXPO_PUBLIC_REVENUE_CAT_KEY` in `.env`
- [ ] Deploy `generate-workout` edge function
- [ ] Deploy `revenuecat-webhook` edge function
- [ ] Add LLM API key as Supabase secret
- [ ] Create Terms of Use and Privacy Policy pages
- [ ] Add Sign in with Apple capability in Xcode
- [ ] Test full flow: sign up → AI builder → save → sync → subscribe
