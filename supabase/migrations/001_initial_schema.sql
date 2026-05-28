-- ─── Enable UUID extension ───────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Enums ───────────────────────────────────────────────────────────────────
create type user_role as enum ('ADMIN','EDITOR','STAFF','SELLER','BARTENDER','VIP_GUEST','GUEST');
create type event_status as enum ('DRAFT','PUBLISHED','CANCELLED','ARCHIVED');
create type ticket_tier as enum ('EARLY_BIRD','GENERAL','LATE','DOOR','VIP','FREE');
create type order_status as enum ('PENDING','PAID','CANCELLED','REFUNDED','PARTIALLY_REFUNDED');
create type drink_order_status as enum ('PENDING','IN_PROGRESS','FULFILLED','CANCELLED');
create type payment_method as enum ('ONLINE','CASH','CARD_TERMINAL','TAP_TO_PAY');
create type drink_category as enum ('COCKTAIL','BEER','WINE','SPIRIT','SOFT_DRINK','SHOT','OTHER');

-- ─── Profiles (extends auth.users) ───────────────────────────────────────────
create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null unique,
  name             text not null default '',
  phone            text,
  role             user_role not null default 'GUEST',
  avatar_url       text,
  stripe_customer_id text unique,
  loyalty_discount boolean not null default true,
  vip_notes        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── Events ──────────────────────────────────────────────────────────────────
create table events (
  id             uuid primary key default uuid_generate_v4(),
  slug           text not null unique,
  name           text not null,
  description    text,
  cover_image_url text,
  start_date     timestamptz not null,
  end_date       timestamptz,
  venue          text,
  address        text,
  capacity       int not null,
  status         event_status not null default 'DRAFT',
  tax_rate       float not null default 0,
  created_by_id  uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index events_slug_idx on events(slug);
create index events_status_idx on events(status);
create index events_start_date_idx on events(start_date);

-- ─── Ticket Types ─────────────────────────────────────────────────────────────
create table ticket_types (
  id             uuid primary key default uuid_generate_v4(),
  event_id       uuid not null references events(id) on delete cascade,
  name           text not null,
  description    text,
  price          float not null,
  quantity       int not null,
  sold           int not null default 0,
  tier           ticket_tier not null default 'GENERAL',
  max_per_order  int not null default 10,
  sale_starts_at timestamptz,
  sale_ends_at   timestamptz,
  is_bundle      boolean not null default false,
  bundle_size    int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index ticket_types_event_id_idx on ticket_types(event_id);

-- ─── Promo Codes ─────────────────────────────────────────────────────────────
create table promo_codes (
  id             uuid primary key default uuid_generate_v4(),
  event_id       uuid references events(id),
  code           text not null unique,
  discount_type  text not null check (discount_type in ('percent','fixed')),
  discount_value float not null,
  usage_limit    int,
  used_count     int not null default 0,
  expires_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index promo_codes_code_idx on promo_codes(code);

-- ─── Orders ───────────────────────────────────────────────────────────────────
create table orders (
  id                          uuid primary key default uuid_generate_v4(),
  user_id                     uuid references profiles(id),
  guest_email                 text,
  guest_name                  text,
  event_id                    uuid not null references events(id),
  stripe_payment_intent_id    text unique,
  stripe_checkout_session_id  text unique,
  subtotal                    float not null,
  discount_amount             float not null default 0,
  tax_amount                  float not null default 0,
  total                       float not null,
  currency                    text not null default 'usd',
  status                      order_status not null default 'PENDING',
  payment_method              payment_method not null default 'ONLINE',
  promo_code_id               uuid references promo_codes(id),
  seller_id                   uuid references profiles(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index orders_user_id_idx on orders(user_id);
create index orders_event_id_idx on orders(event_id);
create index orders_status_idx on orders(status);

-- ─── Order Items ──────────────────────────────────────────────────────────────
create table order_items (
  id             uuid primary key default uuid_generate_v4(),
  order_id       uuid not null references orders(id) on delete cascade,
  ticket_type_id uuid not null references ticket_types(id),
  quantity       int not null,
  unit_price     float not null,
  total          float not null
);

-- ─── Tickets ──────────────────────────────────────────────────────────────────
create table tickets (
  id              uuid primary key default uuid_generate_v4(),
  order_id        uuid not null references orders(id),
  order_item_id   uuid not null references order_items(id),
  qr_code         text not null unique default uuid_generate_v4()::text,
  used_at         timestamptz,
  wallet_pass_id  text,
  wallet_pass_url text,
  holder_name     text,
  holder_email    text,
  created_at      timestamptz not null default now()
);
create index tickets_qr_code_idx on tickets(qr_code);
create index tickets_order_id_idx on tickets(order_id);

-- ─── Check-Ins ────────────────────────────────────────────────────────────────
create table check_ins (
  id          uuid primary key default uuid_generate_v4(),
  ticket_id   uuid not null unique references tickets(id),
  event_id    uuid not null references events(id),
  checked_by  uuid not null references profiles(id),
  checked_at  timestamptz not null default now()
);

-- ─── Waitlist ─────────────────────────────────────────────────────────────────
create table waitlist_entries (
  id         uuid primary key default uuid_generate_v4(),
  event_id   uuid not null references events(id) on delete cascade,
  email      text not null,
  name       text,
  notified   boolean not null default false,
  created_at timestamptz not null default now(),
  unique(event_id, email)
);

-- ─── Invoices ─────────────────────────────────────────────────────────────────
create table invoices (
  id         uuid primary key default uuid_generate_v4(),
  order_id   uuid not null unique references orders(id),
  number     text not null unique,
  pdf_url    text,
  issued_at  timestamptz not null default now()
);

-- ─── Seller Sessions ──────────────────────────────────────────────────────────
create table seller_sessions (
  id             uuid primary key default uuid_generate_v4(),
  seller_id      uuid not null references profiles(id),
  event_id       uuid references events(id),
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  total_sold     int not null default 0,
  total_revenue  float not null default 0
);

-- ─── Drinks ───────────────────────────────────────────────────────────────────
create table drinks (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  description  text,
  category     drink_category not null default 'OTHER',
  image_url    text,
  price        float not null,
  sale_enabled boolean not null default false,
  sale_price   float,
  available    boolean not null default true,
  sort_order   int not null default 0,
  allergens    text[] not null default '{}',
  is_popular   boolean not null default false,
  order_count  int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── Drink Orders ─────────────────────────────────────────────────────────────
create table drink_orders (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid references profiles(id),
  guest_name              text,
  qr_token                text not null unique default uuid_generate_v4()::text,
  qr_expires_at           timestamptz not null,
  status                  drink_order_status not null default 'PENDING',
  is_vip                  boolean not null default false,
  paid_online             boolean not null default false,
  stripe_payment_intent_id text,
  total                   float not null,
  event_id                uuid references events(id),
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index drink_orders_qr_token_idx on drink_orders(qr_token);
create index drink_orders_status_idx on drink_orders(status);
create index drink_orders_is_vip_idx on drink_orders(is_vip);

-- ─── Drink Order Items ────────────────────────────────────────────────────────
create table drink_order_items (
  id             uuid primary key default uuid_generate_v4(),
  drink_order_id uuid not null references drink_orders(id) on delete cascade,
  drink_id       uuid not null references drinks(id),
  quantity       int not null,
  unit_price     float not null,
  notes          text,
  fulfilled_at   timestamptz
);

-- ─── updated_at triggers ──────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger set_profiles_updated_at before update on profiles for each row execute procedure set_updated_at();
create trigger set_events_updated_at before update on events for each row execute procedure set_updated_at();
create trigger set_ticket_types_updated_at before update on ticket_types for each row execute procedure set_updated_at();
create trigger set_orders_updated_at before update on orders for each row execute procedure set_updated_at();
create trigger set_drinks_updated_at before update on drinks for each row execute procedure set_updated_at();
create trigger set_drink_orders_updated_at before update on drink_orders for each row execute procedure set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table events enable row level security;
alter table ticket_types enable row level security;
alter table orders enable row level security;
alter table tickets enable row level security;
alter table check_ins enable row level security;
alter table drinks enable row level security;
alter table drink_orders enable row level security;
alter table drink_order_items enable row level security;

-- Profiles: users see own, staff+ see all
create policy "profiles_own" on profiles for select using (auth.uid() = id);
create policy "profiles_staff_select" on profiles for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR','STAFF','SELLER','BARTENDER'))
);
create policy "profiles_own_update" on profiles for update using (auth.uid() = id);
create policy "profiles_admin_all" on profiles for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN')
);

-- Events: public read published, admin/editor write
create policy "events_public_read" on events for select using (status = 'PUBLISHED');
create policy "events_staff_read" on events for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR','STAFF','SELLER'))
);
create policy "events_editor_write" on events for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR'))
);

-- Ticket types: public read, editor write
create policy "ticket_types_public_read" on ticket_types for select using (true);
create policy "ticket_types_editor_write" on ticket_types for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR'))
);

-- Orders: users see own, staff see all
create policy "orders_own" on orders for select using (user_id = auth.uid());
create policy "orders_staff_read" on orders for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR','SELLER'))
);
create policy "orders_insert_authenticated" on orders for insert with check (true);
create policy "orders_admin_update" on orders for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR'))
);

-- Tickets: users see own
create policy "tickets_own" on tickets for select using (
  exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "tickets_staff_read" on tickets for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR','STAFF'))
);

-- Check-ins: staff only
create policy "check_ins_staff" on check_ins for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR','STAFF'))
);

-- Drinks: public read, staff write
create policy "drinks_public_read" on drinks for select using (true);
create policy "drinks_staff_write" on drinks for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR','STAFF','BARTENDER'))
);

-- Drink orders: users see own, bartenders see all pending/in_progress
create policy "drink_orders_own" on drink_orders for select using (user_id = auth.uid());
create policy "drink_orders_bar_read" on drink_orders for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR','STAFF','BARTENDER'))
);
create policy "drink_orders_insert" on drink_orders for insert with check (true);
create policy "drink_orders_bar_update" on drink_orders for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR','STAFF','BARTENDER'))
);
create policy "drink_order_items_read" on drink_order_items for select using (true);
create policy "drink_order_items_insert" on drink_order_items for insert with check (true);
create policy "drink_order_items_bar_update" on drink_order_items for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR','STAFF','BARTENDER'))
);

-- Promo codes: staff only
alter table promo_codes enable row level security;
create policy "promo_codes_staff" on promo_codes for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR'))
);

-- Waitlist: public insert, staff read
alter table waitlist_entries enable row level security;
create policy "waitlist_public_insert" on waitlist_entries for insert with check (true);
create policy "waitlist_staff_read" on waitlist_entries for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN','EDITOR'))
);

-- Invoices: users see own, admin all
alter table invoices enable row level security;
create policy "invoices_own" on invoices for select using (
  exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "invoices_admin" on invoices for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN')
);

-- Seller sessions: sellers see own, admin all
alter table seller_sessions enable row level security;
create policy "seller_sessions_own" on seller_sessions for all using (seller_id = auth.uid());
create policy "seller_sessions_admin" on seller_sessions for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN')
);
