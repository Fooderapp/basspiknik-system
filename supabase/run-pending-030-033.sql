-- =============================================================
-- EventOS — run pending migrations 030–033 on production
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Idempotent: safe to run more than once.
-- After running: Settings → API → Reload schema cache.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 030_credit_redemption.sql
-- ─────────────────────────────────────────────────────────────
-- Migration 030: Credit redemption at checkout
--
-- Lets users apply earned credits as a discount at checkout via a slider
-- (replacing / alternative to a promo code). This migration ships the schema
-- and a SAFE, read-only quote function only. The write path (reserve on
-- payment-intent creation, refund on failure) is wired in a follow-up once it
-- is attached to the real Stripe flow.
--
-- Tunables on app_settings (global row):
--   credit_redeem_enabled  master on/off for redemption            (default false)
--   credit_value_huf       1 credit = X Ft of discount             (default 0)
--   credit_max_apply       max credits applicable per order, 0 = ∞ (default 0)
--   credit_max_pct         cap discount at N% of the order total   (default 50)
--   credit_min_redeem      min credits required to redeem any      (default 0)

-- ── Settings tunables ────────────────────────────────────────────────────────
alter table app_settings
  add column if not exists credit_redeem_enabled boolean not null default false,
  add column if not exists credit_value_huf      numeric not null default 0,
  add column if not exists credit_max_apply      int     not null default 0,
  add column if not exists credit_max_pct        int     not null default 50,
  add column if not exists credit_min_redeem     int     not null default 0;

-- ── Extend ledger reasons with redemption + refund ───────────────────────────
alter table credit_transactions
  drop constraint if exists credit_transactions_reason_check;
alter table credit_transactions
  add constraint credit_transactions_reason_check
  check (reason in (
    'TICKET_PURCHASE','DRINK_ORDER','SPIN','SPIN_WIN','ADJUST','REDEEM','REDEEM_REFUND'
  ));

-- ── Read-only redemption quote ───────────────────────────────────────────────
-- Given an order total (Ft, after any promo) and an optional requested credit
-- amount, returns the credits that MAY be applied and the resulting discount —
-- capped by balance, the absolute cap, the % cap, and the order total itself.
-- Pure read: no ledger writes. The client slider and the server both call this
-- so the cap is computed in exactly one place.
create or replace function credit_redeem_quote(
  p_order_total numeric,            -- order total in Ft (post-promo, pre-credit)
  p_requested   int default null    -- credits user wants to apply; null = max
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user        uuid    := auth.uid();
  v_enabled     boolean;
  v_value       numeric;
  v_max_apply   int;
  v_max_pct     int;
  v_min         int;
  v_balance     int;
  v_cap_credits int;
  v_credits     int;
  v_discount    numeric;
begin
  if v_user is null then
    return jsonb_build_object('error', 'auth');
  end if;

  select credit_redeem_enabled, credit_value_huf, credit_max_apply, credit_max_pct, credit_min_redeem
    into v_enabled, v_value, v_max_apply, v_max_pct, v_min
  from app_settings where id = 'global';

  if not coalesce(v_enabled, false) or coalesce(v_value, 0) <= 0 then
    return jsonb_build_object(
      'enabled', false, 'credits', 0, 'discount', 0,
      'maxCredits', 0, 'balance', 0, 'value', 0, 'minRedeem', 0
    );
  end if;

  v_balance := coalesce((select sum(amount) from credit_transactions where user_id = v_user), 0);

  -- Largest credit amount applicable to this order:
  v_cap_credits := v_balance;
  if v_max_apply > 0 then
    v_cap_credits := least(v_cap_credits, v_max_apply);
  end if;
  if v_max_pct > 0 then
    v_cap_credits := least(v_cap_credits, floor((p_order_total * v_max_pct / 100.0) / v_value)::int);
  end if;
  -- never discount more than the order is worth
  v_cap_credits := least(v_cap_credits, floor(p_order_total / v_value)::int);
  v_cap_credits := greatest(v_cap_credits, 0);

  v_credits := coalesce(p_requested, v_cap_credits);
  v_credits := greatest(0, least(v_credits, v_cap_credits));

  -- minimum redemption threshold: applying below it applies nothing
  if v_credits > 0 and v_min > 0 and v_credits < v_min then
    v_credits := 0;
  end if;

  v_discount := v_credits * v_value;

  return jsonb_build_object(
    'enabled',    true,
    'credits',    v_credits,
    'discount',   v_discount,
    'maxCredits', v_cap_credits,
    'balance',    v_balance,
    'value',      v_value,
    'minRedeem',  v_min
  );
end;
$$;

grant execute on function credit_redeem_quote(numeric, int) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 031_credit_redemption_finalize.sql
-- ─────────────────────────────────────────────────────────────
-- Migration 031: Finalize credit redemption (deduct on payment success)
--
-- The web/mobile checkout reduces the Stripe charge by the redeemed credits and
-- stamps the credit count into the PaymentIntent / Checkout Session metadata.
-- When the payment succeeds, fulfillment calls this to actually debit the
-- ledger. Keyed on (order_id, reason) — the existing unique index makes webhook
-- retries idempotent (a re-delivered event can never double-debit).

create or replace function finalize_credit_redemption(
  p_order_id uuid,
  p_user_id  uuid,
  p_credits  int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_balance int;
begin
  if p_order_id is null or p_user_id is null or coalesce(p_credits, 0) <= 0 then
    return;
  end if;

  -- Clamp to the balance actually available now (guards the rare case where the
  -- same credits were spent in a parallel checkout between quote and capture).
  v_balance := coalesce((select sum(amount) from credit_transactions where user_id = p_user_id), 0);
  if v_balance < p_credits then
    p_credits := v_balance;
  end if;
  if p_credits <= 0 then
    return;
  end if;

  insert into credit_transactions(user_id, amount, reason, order_id)
  values (p_user_id, -p_credits, 'REDEEM', p_order_id)
  on conflict do nothing;  -- (order_id, reason) unique index → idempotent
end;
$$;

grant execute on function finalize_credit_redemption(uuid, uuid, int) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 032_credit_tasks.sql
-- ─────────────────────────────────────────────────────────────
-- Migration 032: Credit task system
--
-- Admins define "tasks" (follow us, share to story, complete profile, leave a
-- review, …). Users complete them to earn credits. Verification is honor-based
-- (Meta exposes no API to confirm follows/shares) with anti-abuse guards:
-- one-time-or-cooldown, optional admin review for high-value tasks, a global
-- daily cap, and clawback (admin can reject an approved completion).
--
-- Trust model: lean credit weight on internal/auto-verifiable actions; keep
-- social tasks low-value and honor-based.

-- ── Global daily cap on instant (honor) task credits (0 = no cap) ─────────────
alter table app_settings
  add column if not exists task_daily_cap int not null default 0;

-- ── Task definitions ─────────────────────────────────────────────────────────
create table if not exists credit_tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  platform        text not null default 'internal'
                    check (platform in ('internal','facebook','instagram','tiktok','google','youtube','other')),
  url             text,                          -- optional link/deep-link to open
  cta_label       text not null default 'Mark done',
  reward_credits  int  not null default 1 check (reward_credits >= 0),
  repeatable      boolean not null default false,
  cooldown_hours  int  not null default 0,       -- for repeatable tasks
  requires_review boolean not null default false,-- true → admin approves before credit
  active          boolean not null default true,
  sort_order      int  not null default 0,
  created_at      timestamptz not null default now()
);

alter table credit_tasks enable row level security;

drop policy if exists credit_tasks_select on credit_tasks;
create policy credit_tasks_select on credit_tasks for select using (
  active = true
  or exists (select 1 from profiles where id = auth.uid() and role in ('ADMIN','EDITOR'))
);

drop policy if exists credit_tasks_write on credit_tasks;
create policy credit_tasks_write on credit_tasks for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN')
);

-- ── Completions (one row per user attempt) ───────────────────────────────────
create table if not exists credit_task_completions (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references credit_tasks(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  status       text not null default 'APPROVED'
                 check (status in ('PENDING','APPROVED','REJECTED')),
  proof_url    text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references profiles(id)
);

create index if not exists idx_task_completions_user on credit_task_completions(user_id);
create index if not exists idx_task_completions_task on credit_task_completions(task_id);
create index if not exists idx_task_completions_status on credit_task_completions(status);

alter table credit_task_completions enable row level security;

drop policy if exists task_completions_select on credit_task_completions;
create policy task_completions_select on credit_task_completions for select using (
  user_id = auth.uid()
  or exists (select 1 from profiles where id = auth.uid() and role in ('ADMIN','EDITOR'))
);
-- All writes go through SECURITY DEFINER RPCs.

-- ── Ledger: tie task credits to a completion (idempotent grant) ──────────────
alter table credit_transactions
  add column if not exists task_completion_id uuid references credit_task_completions(id) on delete set null;

create unique index if not exists uniq_credit_tx_task
  on credit_transactions(task_completion_id) where task_completion_id is not null;

alter table credit_transactions
  drop constraint if exists credit_transactions_reason_check;
alter table credit_transactions
  add constraint credit_transactions_reason_check
  check (reason in (
    'TICKET_PURCHASE','DRINK_ORDER','SPIN','SPIN_WIN','ADJUST',
    'REDEEM','REDEEM_REFUND','TASK_REWARD'
  ));

-- ── Claim a task ─────────────────────────────────────────────────────────────
-- Returns { ok, status, credits, balance } or { error }.
create or replace function claim_task(p_task_id uuid, p_proof text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user        uuid := auth.uid();
  v_task        credit_tasks%rowtype;
  v_last        timestamptz;
  v_cap         int;
  v_today       int;
  v_completion  uuid;
  v_status      text;
begin
  if v_user is null then
    return jsonb_build_object('error', 'auth');
  end if;

  select * into v_task from credit_tasks where id = p_task_id and active = true;
  if not found then
    return jsonb_build_object('error', 'Task not available');
  end if;

  -- Serialize per user so concurrent taps can't double-claim.
  perform pg_advisory_xact_lock(hashtext(v_user::text || p_task_id::text));

  -- One-time tasks: block if already approved or pending.
  if not v_task.repeatable then
    if exists (
      select 1 from credit_task_completions
      where task_id = p_task_id and user_id = v_user and status in ('APPROVED','PENDING')
    ) then
      return jsonb_build_object('error', 'Already completed');
    end if;
  else
    -- Repeatable: enforce cooldown since the last completion.
    if v_task.cooldown_hours > 0 then
      select max(created_at) into v_last from credit_task_completions
      where task_id = p_task_id and user_id = v_user and status in ('APPROVED','PENDING');
      if v_last is not null and v_last > now() - make_interval(hours => v_task.cooldown_hours) then
        return jsonb_build_object('error', 'On cooldown');
      end if;
    end if;
  end if;

  v_status := case when v_task.requires_review then 'PENDING' else 'APPROVED' end;

  -- Global daily cap applies only to instant grants.
  if v_status = 'APPROVED' then
    select task_daily_cap into v_cap from app_settings where id = 'global';
    if coalesce(v_cap, 0) > 0 then
      select coalesce(sum(amount), 0) into v_today
      from credit_transactions
      where user_id = v_user and reason = 'TASK_REWARD' and created_at >= date_trunc('day', now());
      if v_today + v_task.reward_credits > v_cap then
        return jsonb_build_object('error', 'Daily credit limit reached');
      end if;
    end if;
  end if;

  insert into credit_task_completions(task_id, user_id, status, proof_url)
  values (p_task_id, v_user, v_status, p_proof)
  returning id into v_completion;

  if v_status = 'APPROVED' then
    insert into credit_transactions(user_id, amount, reason, task_completion_id)
    values (v_user, v_task.reward_credits, 'TASK_REWARD', v_completion)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'credits', case when v_status = 'APPROVED' then v_task.reward_credits else 0 end,
    'balance', coalesce((select sum(amount) from credit_transactions where user_id = v_user), 0)
  );
end;
$$;

grant execute on function claim_task(uuid, text) to authenticated;

-- ── Admin review of a pending completion (approve → credit, reject → clawback)─
create or replace function review_task_completion(p_completion_id uuid, p_approve boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_row   credit_task_completions%rowtype;
  v_task  credit_tasks%rowtype;
begin
  if not exists (select 1 from profiles where id = v_admin and role in ('ADMIN','EDITOR')) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_row from credit_task_completions where id = p_completion_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select * into v_task from credit_tasks where id = v_row.task_id;

  if p_approve then
    update credit_task_completions
      set status = 'APPROVED', reviewed_at = now(), reviewed_by = v_admin
      where id = p_completion_id;
    -- grant once (idempotent via uniq_credit_tx_task)
    insert into credit_transactions(user_id, amount, reason, task_completion_id)
    values (v_row.user_id, v_task.reward_credits, 'TASK_REWARD', v_row.id)
    on conflict do nothing;
  else
    update credit_task_completions
      set status = 'REJECTED', reviewed_at = now(), reviewed_by = v_admin
      where id = p_completion_id;
    -- clawback any credit already granted for this completion
    delete from credit_transactions where task_completion_id = v_row.id;
  end if;

  return jsonb_build_object('ok', true, 'approved', p_approve);
end;
$$;

grant execute on function review_task_completion(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 033_ticket_visibility.sql
-- ─────────────────────────────────────────────────────────────
-- Migration 033: Ticket type visibility controls
--
-- Lets admins hide a ticket type from the public event page without deleting it,
-- and optionally schedule a visibility window. Door tickets are already POS-only
-- (filtered everywhere); these add manual + scheduled control for any type.
--
--   is_visible    – master show/hide on the public event page (default true)
--   visible_from  – if set, hidden before this time
--   visible_until – if set, hidden after this time

alter table ticket_types
  add column if not exists is_visible   boolean     not null default true,
  add column if not exists visible_from  timestamptz,
  add column if not exists visible_until timestamptz;

-- Make the new columns/tables visible to the API immediately:
notify pgrst, 'reload schema';
