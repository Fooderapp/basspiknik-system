# EventOS — Configuration Guide

How the system is configured, what an admin manages from the **dashboard**, and
what must stay in the **host** (Vercel / mobile build).

---

## 1. Two layers of config

### A. Bootstrap (host-level, cannot move) — set ONCE per deployment

These are needed *before* the app can read its own database, so they must live
in the host environment.

**Vercel → Project → Settings → Environment Variables**

| Var | What |
|-----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (reads the config table) |

**Mobile build (`apps/mobile/.env`)** — baked at build time

| Var | What |
|-----|------|
| `EXPO_PUBLIC_SUPABASE_URL` | same Supabase URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | same anon key |
| `EXPO_PUBLIC_API_URL` | backend base URL, e.g. `https://basspiknik.com` |

> These three mobile vars are the only thing an installer must set in the build.
> Everything else the app fetches at runtime.

### B. Runtime (admin dashboard) — Dashboard → Settings → Integrations & keys

Stored in the `system_config` table (DB-first, env fallback). Change anytime,
no redeploy.

| Key | Group | Notes |
|-----|-------|-------|
| `STRIPE_SECRET_KEY` | Stripe | secret, server-only |
| `STRIPE_WEBHOOK_SECRET` | Stripe | secret, server-only |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe | public; served to mobile at runtime via `/api/public-config` |
| `BILLINGO_API_KEY` | Billingo | secret |
| `BILLINGO_BLOCK_ID` | Billingo | document block id |
| `BILLINGO_BANK_ACCOUNT_ID` | Billingo | bank account id |
| `BILLINGO_VAT` | Billingo | default `27%` |
| `BILLINGO_PAYMENT_METHOD` | Billingo | online default `online_bankcard` |
| `RESEND_API_KEY` | Resend | secret |
| `RESEND_FROM` | Resend | sender address |
| `NEXT_PUBLIC_APP_URL` | General | public URL, served at runtime |

Business config (currency, language, credits, spin, POS-cash invoicing) lives in
**Dashboard → Settings** (the `app_settings` table).

---

## 2. First-time setup checklist

1. **Database migrations** — run in Supabase SQL Editor, in order:
   - `026_system_config.sql` (enables dashboard-managed keys)
   - `027_pos_cash_invoicing_toggle.sql` (POS-cash invoice toggle)
   - Then **reload the PostgREST schema cache**
     (Supabase → Settings → API → *Reload schema*, or `NOTIFY pgrst, 'reload schema';`).

2. **Bootstrap env** — set the host-level vars from §1A in Vercel + mobile `.env`.

3. **Open the dashboard** → Settings → Integrations & keys → fill in Stripe /
   Billingo / Resend / public URL. Hit **Save**.
   - Each field shows **set / not set**, source (**DB** vs **env**), masked preview.
   - A DB value overrides the matching env var; clear a field to fall back to env.
   - If the table/migration is missing, Save now reports the real error.

4. **Business settings** → Settings → set Currency, Language, Credits, Invoicing.

---

## 3. Stripe — connecting a (new) account

1. **Create the Stripe account**, finish verification, confirm the desired
   currency is enabled (for Hungary: **HUF**).

2. **Keys** → Dashboard → Settings → Integrations & keys → Stripe:
   - `STRIPE_SECRET_KEY` = `sk_live_…`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_…`
     - Web uses hosted Checkout (no client key needed).
     - Mobile fetches this from `/api/public-config` on next app launch — **no
       rebuild needed**.

3. **Webhook** (per-account, required):
   Stripe Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://<your-app-url>/api/webhooks/stripe`
   - Events: `checkout.session.completed` **and** `payment_intent.succeeded`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET` in the dashboard.

4. **Currency** → Dashboard → Settings → Currency = **HUF** (or:
   `update app_settings set currency='HUF', language='hu' where id='global';`).

### HUF notes
- Amounts are sent to Stripe in the minor unit (× 100). Whole-forint prices are
  always valid (e.g. 8000 Ft → 800000).
- Online card payments can present in HUF even if the account settles in EUR.
- **Tap to Pay / card terminal** is locked to the account's settlement currency —
  a HUF terminal needs a HUF-settling account.

---

## 4. Billingo — invoicing

- Set the five `BILLINGO_*` keys in the dashboard. Verify with the admin
  diagnostic: open `/api/billingo/test` (shows key validity, block + bank ids,
  recent orders + invoice status). `/api/billingo/test?create=1` issues a real
  test invoice.
- Backfill a missing invoice: `/api/billingo/backfill` (issues the invoice for
  the latest paid order without one; repeat to catch up).

### Invoicing rules
| Sale | Invoiced? | Billingo method |
|------|-----------|-----------------|
| Online (Stripe) | always | `online_bankcard` |
| POS card terminal | always | `bankcard` |
| POS cash | **toggle** (Settings → Invoicing) | `cash` |
| Free / spin-won | never | — |

Country names are normalised to ISO-2 automatically (`Magyarország` → `HU`).
`settings.round` = `five` for HUF, `none` for decimal currencies.

---

## 5. Diagnostics quick reference (admin-only URLs)

| URL | Purpose |
|-----|---------|
| `/api/public-config` | What clients receive (publishable key + app URL) |
| `/api/billingo/test` | Billingo config + recent orders/invoices |
| `/api/billingo/test?create=1` | Issue a real test invoice, raw API reply |
| `/api/billingo/backfill` | Issue the invoice for the latest order missing one |

---

## 6. What still needs a rebuild

Only the **bootstrap** mobile vars (§1A): `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`. Change those → rebuild
the mobile app. Everything else (Stripe keys incl. publishable, Billingo, Resend,
app URL, currency, all business settings) is runtime — dashboard only.
