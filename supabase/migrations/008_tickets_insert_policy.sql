-- Migration 008: Add missing INSERT policy on tickets table
-- The webhook uses service_role (bypasses RLS) but we need this for
-- any future direct inserts and for completeness.

-- Allow service-role / admin inserts (no restriction)
create policy "tickets_insert" on tickets
  for insert with check (true);

-- Allow users to see their own tickets by holder_email too
-- (useful for guest checkouts where user_id is not set on the order)
create policy "tickets_own_by_email" on tickets
  for select using (
    holder_email = (select email from profiles where id = auth.uid())
  );
