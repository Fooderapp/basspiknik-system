# EventOS — Codebase Guide for Claude

## Stack
- **Monorepo**: Turborepo + pnpm workspaces (`apps/web`)
- **Framework**: Next.js 15 App Router, React 19, TypeScript
- **Auth**: Supabase Auth with `@supabase/ssr`
- **Database**: Supabase PostgreSQL — no Prisma, all clients cast `as any`
- **RLS**: Row Level Security with `get_my_role()` SECURITY DEFINER
- **Payments**: Stripe Checkout (EUR), webhook at `/api/webhooks/stripe`
- **Email**: Resend SDK — see `apps/web/src/lib/email.ts`
- **Deployment**: Vercel (root dir: `apps/web`, build: `pnpm build`)

## UI Library — shadcn/ui (ALWAYS USE THIS)
All UI components come from **shadcn/ui**: https://ui.shadcn.com
- Components live in `apps/web/src/components/ui/`
- Built on Radix UI primitives + Tailwind CSS
- **Always prefer shadcn components** over custom HTML for: buttons, inputs, dialogs,
  dropdowns, badges, cards, tabs, selects, toasts, etc.
- Add new components via: `pnpm dlx shadcn@latest add <component>`
- Never install separate UI libraries (e.g. MUI, Chakra, Mantine) — extend shadcn instead
- Icons: `lucide-react` (already installed)
- Toasts: `sonner` via `<Toaster />` in layout

## Key files
- `apps/web/src/lib/supabase/types.ts` — DB types
- `apps/web/src/lib/auth.ts` — `getCurrentProfile()`, `requireRole()`
- `apps/web/src/lib/email.ts` — `sendTicketConfirmation()` via Resend
- `apps/web/src/lib/stripe.ts` — Stripe client
- `apps/web/src/lib/utils.ts` — `formatDate()`, `formatCurrency()`, `cn()`

## Conventions
- Server components fetch directly from Supabase
- Client components use `fetch()` to hit `/api/*` routes
- All Supabase clients created per-request (not module-level)
- DB migrations in `supabase/migrations/` — always run in Supabase SQL Editor for prod
- After migrations that add columns, reload PostgREST schema cache in Supabase dashboard

## Env vars (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `RESEND_API_KEY` / `RESEND_FROM` (e.g. `EventOS <tickets@mail.basspiknik.com>`)
- `NEXT_PUBLIC_APP_URL` (e.g. `https://basspiknik-system.vercel.app`)
