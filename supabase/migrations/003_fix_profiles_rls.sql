-- Fix: infinite recursion on profiles RLS policies.
-- The staff/admin SELECT policies queried `profiles` to check the caller's role,
-- which triggered RLS on `profiles` again → infinite loop.
-- Solution: a SECURITY DEFINER function that reads the role as the DB owner
-- (bypassing RLS entirely), then use that function in the policies.

-- 1. Drop the broken recursive policies
drop policy if exists "profiles_staff_select" on profiles;
drop policy if exists "profiles_admin_all" on profiles;

-- 2. Create a stable, security-definer helper (runs as DB owner → no RLS)
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid();
$$;

-- 3. Recreate the policies using the helper (no self-referential subquery)
create policy "profiles_staff_select" on profiles
  for select using (
    public.get_my_role() in ('ADMIN','EDITOR','STAFF','SELLER','BARTENDER')
  );

create policy "profiles_admin_all" on profiles
  for all using (
    public.get_my_role() = 'ADMIN'
  );
