-- Migration 034: Scannable QR action codes
--
-- Admins generate QR codes that users scan in-app. Each code carries a typed
-- action, redeemed through a SECURITY DEFINER RPC (so codes stay private — the
-- client only ever sees a code, never the table):
--   ONE_TIME_CREDIT  grant `credit_amount` credits (once per user)
--   OPEN_EVENT       deep-link to an event (returns its slug)
--   LINK             open an arbitrary URL / in-app path
--   MESSAGE          show an admin-written announcement
--
-- Usage guards: optional global `max_uses` (0 = unlimited) and `per_user_once`
-- (each user redeems a given code once). Credit grants are idempotent via a
-- unique index tying the ledger row to a single redemption.

create table if not exists qr_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,                 -- random token embedded in the QR
  type           text not null
                   check (type in ('ONE_TIME_CREDIT','OPEN_EVENT','LINK','MESSAGE')),
  label          text,                                 -- admin-facing label
  credit_amount  int  not null default 0,              -- ONE_TIME_CREDIT
  event_id       uuid references events(id) on delete cascade,  -- OPEN_EVENT
  url            text,                                 -- LINK
  message        text,                                 -- MESSAGE
  max_uses       int  not null default 0,              -- 0 = unlimited (global)
  per_user_once  boolean not null default true,        -- each user redeems once
  uses           int  not null default 0,
  active         boolean not null default true,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

create table if not exists qr_code_redemptions (
  id         uuid primary key default gen_random_uuid(),
  qr_id      uuid not null references qr_codes(id) on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_qr_red_qr on qr_code_redemptions(qr_id);
create unique index if not exists uniq_qr_user
  on qr_code_redemptions(qr_id, user_id) where user_id is not null;

-- ── Ledger: QR credit grants ─────────────────────────────────────────────────
alter table credit_transactions
  add column if not exists qr_redemption_id uuid references qr_code_redemptions(id) on delete set null;
create unique index if not exists uniq_credit_tx_qr
  on credit_transactions(qr_redemption_id) where qr_redemption_id is not null;

alter table credit_transactions
  drop constraint if exists credit_transactions_reason_check;
alter table credit_transactions
  add constraint credit_transactions_reason_check
  check (reason in (
    'TICKET_PURCHASE','DRINK_ORDER','SPIN','SPIN_WIN','ADJUST',
    'REDEEM','REDEEM_REFUND','TASK_REWARD','QR_CREDIT'
  ));

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table qr_codes enable row level security;
drop policy if exists qr_codes_admin on qr_codes;
create policy qr_codes_admin on qr_codes for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('ADMIN','EDITOR'))
);

alter table qr_code_redemptions enable row level security;
drop policy if exists qr_red_select on qr_code_redemptions;
create policy qr_red_select on qr_code_redemptions for select using (
  user_id = auth.uid()
  or exists (select 1 from profiles where id = auth.uid() and role in ('ADMIN','EDITOR'))
);
-- All redemptions happen through the SECURITY DEFINER RPC below.

-- ── Redeem a scanned code ────────────────────────────────────────────────────
-- Returns { ok, type, label, credits, balance, eventId, eventSlug, url, message }
-- or { error }. Re-scanning a non-credit code (event/link/message) keeps working;
-- a credit code returns 'already' on the second scan for the same user.
create or replace function redeem_qr_code(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_qr    qr_codes%rowtype;
  v_red   uuid;
  v_slug  text;
  v_already boolean;
begin
  if v_user is null then
    return jsonb_build_object('error', 'auth');
  end if;

  select * into v_qr from qr_codes where code = p_code and active = true;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- Serialize concurrent scans of the same code.
  perform pg_advisory_xact_lock(hashtext(p_code));

  if v_qr.max_uses > 0 and v_qr.uses >= v_qr.max_uses then
    return jsonb_build_object('error', 'exhausted');
  end if;

  v_already := exists (
    select 1 from qr_code_redemptions where qr_id = v_qr.id and user_id = v_user
  );

  if v_qr.per_user_once and v_already then
    -- Credit codes can't be re-claimed; informational codes still resolve.
    if v_qr.type = 'ONE_TIME_CREDIT' then
      return jsonb_build_object('error', 'already');
    end if;
  else
    insert into qr_code_redemptions(qr_id, user_id) values (v_qr.id, v_user)
    on conflict do nothing
    returning id into v_red;
    update qr_codes set uses = uses + 1 where id = v_qr.id;

    if v_qr.type = 'ONE_TIME_CREDIT' and v_qr.credit_amount > 0 and v_red is not null then
      insert into credit_transactions(user_id, amount, reason, qr_redemption_id)
      values (v_user, v_qr.credit_amount, 'QR_CREDIT', v_red)
      on conflict do nothing;
    end if;
  end if;

  if v_qr.type = 'OPEN_EVENT' then
    select slug into v_slug from events where id = v_qr.event_id;
  end if;

  return jsonb_build_object(
    'ok',        true,
    'type',      v_qr.type,
    'label',     v_qr.label,
    'credits',   case when v_qr.type = 'ONE_TIME_CREDIT' and not (v_qr.per_user_once and v_already)
                      then v_qr.credit_amount else 0 end,
    'balance',   coalesce((select sum(amount) from credit_transactions where user_id = v_user), 0),
    'eventId',   v_qr.event_id,
    'eventSlug', v_slug,
    'url',       v_qr.url,
    'message',   v_qr.message
  );
end;
$$;

grant execute on function redeem_qr_code(text) to authenticated;

notify pgrst, 'reload schema';
