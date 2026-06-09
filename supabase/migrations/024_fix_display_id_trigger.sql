-- Fix: set_profile_display_id used gen_random_bytes() (pgcrypto, lives in
-- `extensions` schema) but the function had `set search_path = public` so
-- the symbol was not found → trigger errored → auth.users insert rolled back
-- → "Database error saving new user" on every new registration.
--
-- Replace with gen_random_uuid() which is a built-in available in the public
-- search path on all Supabase/PostgreSQL 13+ instances — no pgcrypto needed.

create or replace function set_profile_display_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.display_id is null then
    loop
      new.display_id := 'Bass-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from profiles where display_id = new.display_id);
    end loop;
  end if;
  return new;
end;
$$;
