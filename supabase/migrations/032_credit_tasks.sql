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
