# Tutor Admin

A production-quality web app for a private tutor in Singapore to manage
students, lessons, scheduling, billing and payments. Plain, dense,
internal-admin-tool UI; usable on a phone.

- **Stack:** Next.js (App Router) + TypeScript (strict), Tailwind (minimal),
  Supabase (Postgres + Auth + RLS) via `@supabase/ssr`.
- **Money** is stored as integer cents everywhere. **Timezone** is
  Asia/Singapore everywhere (`timestamptz` in the DB, formatted in SGT in the UI).

---

## 1. Supabase project setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Auth → Providers → Email:** enable Email. For the smoothest first-run,
   turn **"Confirm email" off** (otherwise sign-up requires an email click
   before you can log in).
3. **Project Settings → API:** copy the **Project URL** and the **anon public**
   key.

### Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

`.env.local` is git-ignored — never commit real keys.

### Run the migrations

The schema lives in `supabase/migrations/` as plain SQL. Apply them in order.

**Option A — Supabase CLI (recommended):**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — Dashboard:** open the **SQL Editor** and run each file in
`supabase/migrations/` in filename order:

1. `…_init_schema.sql` — enums, tables, constraints, indexes, default templates
2. `…_functions_triggers.sql` — helpers, integrity guards, recurring generation,
   receipt numbering
3. `…_views.sql` — `v_bill_totals`, `v_payer_ledger`, `v_monthly_summary`,
   `v_student_summary`
4. `…_rls_policies.sql` — RLS enabled + forced on every table
5. `…_payer_balances.sql` — `v_payer_balances`

### Seed sample data (optional but recommended)

After you sign up and complete `/setup`, run `supabase/seed.sql` in the SQL
Editor. It creates 2 payers, 3 students (a sibling pair), 4 enrolments, ~6 weeks
of mixed-status lessons, a SENT bill with a partial payment, and a pending
adjustment. It is idempotent.

---

## 2. Local development

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # unit tests (billing math: uniform vs mixed, totals)
npm run build      # production build
```

First run: sign up at `/signup`, then you'll be routed to `/setup` to enter your
name and PayNow number. Everything else is behind auth.

---

## 3. Deploy to Vercel

1. Push to GitHub and import the repo in Vercel.
2. Add the two environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in **Project → Settings → Environment
   Variables**.
3. Deploy. (Migrations are applied against Supabase separately, as above.)

---

## 4. Billing lifecycle

```
DRAFT ──(Mark as sent)──▶ SENT ──(payment < total)──▶ PARTIALLY_PAID ──▶ PAID
  │                         │                                              │
  └──(delete)               └────────────── VOID ◀──(void)────────────────┘
```

- **Generate bill** collects a payer's unbilled *billable* lessons for a period
  (which statuses count depends on the payer's **billing basis** —
  `SCHEDULED` bills planned lessons upfront; `COMPLETED` bills in arrears) plus
  any pending adjustments, renders the message from your template, and saves a
  **DRAFT**.
- **Copying does not send.** Marking as **SENT** is always an explicit tap and
  re-checks the bill is still a draft (guards two-tab races). It snapshots the
  exact message text and freezes the bill's lessons.
- **Frozen-bill rule:** once a bill is SENT/PARTIALLY_PAID/PAID, its lessons
  cannot be edited, cancelled, rescheduled or deleted (enforced by a database
  trigger). To change one, either **Void & regenerate** (void the bill, make the
  change, re-send a fresh draft) or **Adjust next bill** (keep the sent bill and
  record a credit/charge that lands on the payer's next bill).
- **Payments** derive the bill's status automatically (partial vs paid). An
  overpayment can be booked as a credit on the payer's account.
- **Receipts** are issued for PAID bills; the sequential number (`R-YYYY-NNNN`)
  is allocated atomically by a Postgres function.
- **Adjustments** (`amount_cents`: positive = credit to payer, negative =
  charge) are *pending* until they appear on a bill (`related_bill_id`).

### Money conventions

- Hours: whole numbers plain (`3`), halves as `1.5`.
- Money: no cents shown when `.00` (`$150`), otherwise two decimals (`$112.50`).
- A lesson's amount is always computed as `duration_min / 60 × rate_cents`
  (rate is snapshotted onto the lesson at creation; editing the enrolment's
  default rate only affects future lessons).
- **Uniform** bills (one rate, no adjustment) render a single total line;
  **mixed** bills (multiple rates or an adjustment) render an itemised block.

---

## 5. Project layout

```
app/(app)/            authenticated app (Today, Calendar, Students, Money, Settings)
app/login, /signup, /setup    auth + first-run
lib/                  supabase clients, money/format helpers, render engine
supabase/migrations/  committed SQL migrations
supabase/seed.sql     sample data
```

Row Level Security is on for every table; all access is scoped to
`tutor_id = auth.uid()`, so the app is multi-tenant-safe from day one.
