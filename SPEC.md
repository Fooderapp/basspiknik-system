# Event Ticket + Bar Service System — Full Spec

## Design System

**UI Library:** [shadcn/ui](https://ui.shadcn.com)
**Styling:** Tailwind CSS v4
**Icons:** Lucide React
**Charts:** Recharts (via shadcn/ui charts)
**Fonts:** Geist Sans + Geist Mono
**Theme:** CSS variables, dark/light mode toggle (bartender app default: dark)
**Motion:** Framer Motion (toasts, modals, transitions)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript strict |
| Database | PostgreSQL + Prisma ORM |
| Auth | Clerk (roles + metadata) or NextAuth v5 |
| Payments | Stripe (Checkout, Webhooks, Terminal for Tap to Pay) |
| Email | Resend + React Email templates |
| File storage | Cloudflare R2 / Supabase Storage |
| Wallet passes | PassKit (Apple Wallet) + Google Wallet API |
| QR code gen | `qrcode` npm |
| QR code scan | `html5-qrcode` or `ZXing` |
| State | Zustand + TanStack Query |
| Forms | React Hook Form + Zod |
| Real-time | Pusher Channels or Supabase Realtime |
| Analytics | PostHog (self-hostable) |
| PDF gen | `@react-pdf/renderer` |
| Monorepo | Turborepo |

---

## User Roles & Permissions

| Role | Permissions |
|---|---|
| **Admin** | Full access to everything |
| **Editor** | Create/edit events, tickets, bundles; edit drink sheet; check-in app; manage Guest + VIP Guest users only |
| **Staff** | Edit drink sheet; check-in app access |
| **Seller** | Ticket selling platform only (log in-person sales) |
| **Bartender** | Edit drink sheet; bartender QR-scan webapp |
| **VIP Guest** | Guest access + send bar orders + Stripe online payment |
| **Guest** | Buy tickets online; view own tickets; 10% loyalty discount after registration |

---

## System 1 — Event Ticket Platform

### 1.1 Admin Dashboard

**Auth**
- Admin-only registration (invite link or admin creates account)
- Guest + VIP Guest self-register (email/password or OAuth)
- 10% discount auto-applied on registration (Stripe coupon or metadata flag)

**Event Management**
- Create event: name, description, cover image, date/time (multi-day support), venue, capacity
- Event templates — reuse config from past events
- Clone event
- Draft / Published / Archived states
- Per-event capacity tracking (real-time sold vs. available)

**Ticket Types**
- Free + paid tickets
- Tiered pricing: Early Bird → General → Late → Door
- Bundle packs (e.g. "3-ticket pack at 20% off")
- Group discounts (min quantity threshold)
- Promo/discount codes (fixed amount or %)
- Student / special category flags
- Max tickets per order limit

**Sales Channels**
- Direct dashboard sale (admin/editor manually registers sale)
- Seller platform (staff logs in-person sales)
- Embed widget (public online sales)

**Inventory Sync**
- Single source of truth: all channels decrement same inventory pool
- Oversell prevention via optimistic locking / Stripe idempotency keys
- Real-time inventory visible to admin while sales happen

**Waitlist**
- Auto-open waitlist when event sells out
- Email notify waitlisted users when tickets free up (refund/cancellation)

**Refunds & Cancellations**
- Configurable refund policy per event (full, partial, no refund)
- Admin triggers refund → Stripe refund API → ticket invalidated
- Cancellation fee support

### 1.2 Seller Platform

URL: `/seller` — role-gated

- Log ticket sale: select event → ticket type → quantity → payment method (cash / card / Tap to Pay)
- Tap to Pay: Stripe Terminal SDK (iPhone / Android)
- Real-time running total per seller session
- End-of-day report: sales count, revenue, breakdown by ticket type
- Admin sees all sellers' sales in analytics

### 1.3 Embed Widget

```html
<script src="https://yourapp.com/widget.js" data-event="EVENT_ID"></script>
```

- Lightweight iframe-based
- Shows event info, ticket types, availability
- Checkout → Stripe Checkout (hosted or embedded)
- Guest registers or buys as "non-account" (email capture)
- 10% discount auto-applied for registered guests
- Mobile-first, <100KB bundle

### 1.4 Ticket Delivery

**Email (Resend)**
- Ticket confirmation email (React Email template)
- Styled PDF ticket attachment (`@react-pdf/renderer`)
- QR code embedded in email AND PDF
- Reminder emails: 48h, 24h, 1h before event (scheduled job)
- Post-event: thank-you + NPS survey link

**Apple Wallet**
- `.pkpass` generated server-side via PassKit
- Push update support (event change, cancellation)
- QR code on pass front
- Event details on pass back

**Google Wallet**
- JWT-based pass via Google Wallet API
- Add-to-Google-Wallet button in email + confirmation page
- QR code included

**Fallback**
- If wallet fail: web ticket URL (`/ticket/[id]`) with QR always available
- Downloadable PDF from account page

### 1.5 Check-In App (PWA)

URL: `/checkin` — Editor / Staff / Admin

**Scanner**
- Camera QR scan (html5-qrcode)
- Green border animation = valid ticket
- Red border animation = invalid / already used / wrong event
- Audio feedback (success beep / error buzz)
- Torch/flashlight toggle button
- Manual ticket ID search fallback

**Offline Mode**
- Pre-download guest list on app open
- IndexedDB local cache
- Sync check-ins when reconnected (optimistic local mark)
- Conflict resolution: server wins on reconnect

**Display**
- Guest name, ticket type, seat/zone (if assigned)
- Photo if available (VIP)
- Check-in timestamp

### 1.6 Analytics

Route: `/analytics` — Admin only

**Revenue**
- Total gross revenue per event / date range
- Stripe processing fees (calculated: 2.9% + $0.30 per transaction)
- Estimated payout (gross - fees - refunds)
- Revenue by channel (online / seller / widget)
- Revenue by ticket type

**Sales Velocity**
- Tickets sold over time chart
- Channel comparison
- Promo code performance

**Attendees**
- Check-in rate (% of tickets used)
- No-show count
- Waitlist depth

**Stripe Integration**
- Webhook: `payment_intent.succeeded`, `charge.refunded`, `payout.paid`
- Live payout schedule display

### 1.7 Statements & Invoices

- Per-event financial statement PDF
- Invoice for each purchase (auto-generated, downloadable by guest)
- Bulk export: CSV, XLSX
- VAT/tax line items (configurable tax rate per event)

### 1.8 Guest Registration + Loyalty

- Self-register: email, password, name, phone (optional)
- OAuth: Google, Apple
- On registration: 10% discount coupon auto-created in Stripe → applied at checkout
- Discount visible in cart before payment ("10% member discount applied")
- Account page: order history, tickets, wallet passes, invoices

---

## System 2 — Bar Ordering System

### 2.1 Drink Menu (Public)

URL: `/menu` or `/drinks` — public (no auth required to browse)

- Grid/list of drinks with photo, name, description, price
- Category filter (cocktails, beer, wine, soft drinks, shots)
- Allergen/dietary icons (vegan, gluten-free, etc.)
- "Popular" badge (auto from order count)
- Toggle: Regular price / Sale price (admin sets)
- Availability toggle (auto-disable when out of stock)
- Dark mode optimized

### 2.2 Cart + Order Flow

- Add to cart: drink + quantity
- Cart drawer (sticky bottom on mobile)
- Order notes per item
- Cart review: items, quantities, total
- For **non-VIP guests**: generate QR code + order summary (pay at bar)
- For **VIP guests**: option to pay online via Stripe OR generate QR

**QR Order Code**
- Encodes order ID (not full order data)
- Expires after 30 min if not scanned
- Shows order list beneath QR on screen + in email

### 2.3 Bartender App (PWA)

URL: `/bar` — Bartender / Staff / Admin

**Order Queue**
- Real-time incoming orders (Pusher / Supabase Realtime)
- Card per order: guest name, items, notes, timestamp, order type
- Tap item to mark fulfilled
- Mark full order complete
- 5-second undo window after mark (UX safety net)
- Filter: All / Pending / In Progress / Complete

**QR Scanner**
- Scan guest QR → load their order
- Highlight order in queue after scan
- Large tap targets (glove-friendly)
- Dark mode default (bar lighting)

**VIP Alert System**
- VIP orders appear with distinct color band + sound alert
- Separate "VIP Queue" tab
- Same tap-to-fulfill mechanics
- Order history per VIP guest (bartender can see recurring preferences)

**Tablet Optimization**
- Min touch target 44px
- Landscape + portrait layouts
- No hover-dependent UI

### 2.4 Drink Sheet Management (Dashboard)

Route: `/dashboard/drinks` — Admin / Editor / Staff / Bartender

- Add / edit / delete drinks
- Fields: name, description, category, photo upload, regular price, sale price, available toggle
- Sale price: toggle + input field
- Bulk availability toggle (e.g. "close bar")
- Reorder items (drag handle)
- Inventory alert threshold (optional: mark out-of-stock at X units)

### 2.5 VIP Guest Features

- VIP badge on profile
- Direct order from `/menu` with priority routing
- Online payment toggle per event (Stripe)
- Order history: all past orders across events
- Reorder button (one-tap re-add last order to cart)
- Preference notes (bartender-visible, set by Editor/Admin)
- VIP enable/disable: Editor+ can flip VIP status

---

## Missing Features (Research-Added)

### Ticket System
- **Waitlist** with auto-notify on cancellation
- **Dynamic pricing** — optional per-event price tiers over time
- **Refund workflow** — policy per event, auto Stripe refund
- **Ticket transfer** — guest can transfer to another email
- **Anti-scalping** — rate limiting on embed, max per account
- **RSVP tracking** — separate from paid tickets (free events)
- **Post-event survey** — NPS email link 24h after event
- **Pre-event reminders** — 48h, 24h, 1h automated emails
- **Offline check-in** — IndexedDB cache with sync
- **Duplicate scan detection** — server-side ticket used flag

### Bar System
- **Estimated wait time** — based on current queue depth
- **Order modification window** — 10-second cancel after submit
- **Real-time inventory** — auto-hide items when stock = 0
- **Bartender throughput metrics** — orders/hour, avg fulfillment time
- **Last call timer** — admin sets time, auto-notification to ordering guests
- **Order audit log** — compliance / end-of-night reconciliation
- **Offline queue** — local-first with sync retry on reconnect
- **Tab management** — open tab per guest session (future phase)

---

## App Structure (Turborepo)

```
/apps
  /web          ← Main Next.js app (dashboard + buyer portal)
  /checkin      ← PWA: QR check-in scanner
  /bar          ← PWA: Bartender order queue + scanner
  /widget       ← Embeddable ticket sales widget
/packages
  /ui           ← shadcn/ui components + design tokens
  /db           ← Prisma schema + migrations
  /email        ← React Email templates
  /types        ← Shared TypeScript types
  /wallet       ← Apple + Google Wallet pass generators
  /stripe       ← Stripe helpers + webhook handlers
```

---

## Key Routes

### Web App
| Route | Access |
|---|---|
| `/` | Public landing |
| `/events` | Public event list |
| `/events/[slug]` | Public event detail + buy |
| `/dashboard` | Admin/Editor/Staff |
| `/dashboard/events` | Event management |
| `/dashboard/events/[id]` | Event detail + ticket mgmt |
| `/dashboard/analytics` | Revenue + analytics |
| `/dashboard/guests` | Guest management |
| `/dashboard/drinks` | Drink sheet management |
| `/seller` | Seller platform |
| `/checkin` | Check-in scanner PWA |
| `/bar` | Bartender app PWA |
| `/menu` | Public drink menu |
| `/account` | Guest account + tickets |
| `/ticket/[id]` | Web ticket + QR fallback |

---

## Data Models (Key Entities)

```
User: id, email, name, role, loyaltyDiscount, stripeCustomerId
Event: id, name, slug, date, venue, capacity, status, ...
TicketType: id, eventId, name, price, quantity, tier, ...
Ticket: id, ticketTypeId, userId, qrCode, usedAt, walletPassId
Order: id, userId, eventId, stripePaymentIntentId, total, status
OrderItem: id, orderId, ticketTypeId, quantity, price
PromoCode: id, code, discountType, discountValue, usageLimit, usedCount
Drink: id, name, category, price, salePrice, saleEnabled, available, ...
DrinkOrder: id, userId, items, status, qrToken, paidOnline, stripeId
DrinkOrderItem: id, drinkOrderId, drinkId, quantity, notes, fulfilledAt
```

---

## Phase Roadmap

| Phase | Scope |
|---|---|
| **P1** | Auth + roles, event CRUD, ticket types, Stripe checkout, email delivery, basic dashboard |
| **P2** | Seller platform, Tap to Pay, check-in PWA (QR scan), analytics |
| **P3** | Apple Wallet, Google Wallet, embed widget, promo codes, loyalty discount |
| **P4** | Bar system: drink menu, cart, QR order, bartender app, VIP alerts |
| **P5** | Offline mode, Tap to Pay, waitlist, refunds, post-event email, invoices/statements |
| **P6** | Advanced analytics, inventory, last call, tab management, NPS surveys |

---

## UX Principles

1. Mobile-first everywhere (checkout <2min on mobile)
2. Fee transparency at start of checkout (no surprise at final step)
3. Dark mode default for bartender/checkin apps
4. Offline-first for check-in + bartender (IndexedDB + sync)
5. Touch targets ≥44px (bartender glove-use)
6. QR codes: min display size 2cm×2cm, preloaded 3h before event
7. Real-time inventory sync across all channels (no oversell)
8. 5-10 second undo on all destructive actions (fulfill, mark used)
9. Sound + visual feedback for scan results
10. All Stripe fees shown as line items in analytics
