-- Migration 035: public peek for QR codes (no auth, no redemption)
--
-- An OPEN_EVENT QR should open the public event page WITHOUT requiring login.
-- Redeeming runs as the user (auth required), but resolving "what does this code
-- point to" needs no auth for event codes. qr_peek exposes only the code's type
-- and, for OPEN_EVENT, the target event slug — nothing sensitive (slugs are
-- already public). Credit/link/message codes return just their type so the app
-- can still send the user through login to actually redeem.

create or replace function qr_peek(p_code text)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_qr   qr_codes%rowtype;
  v_slug text;
begin
  select * into v_qr from qr_codes where code = p_code and active = true;
  if not found then
    return jsonb_build_object('type', null);
  end if;
  if v_qr.type = 'OPEN_EVENT' then
    select slug into v_slug from events where id = v_qr.event_id;
  end if;
  return jsonb_build_object('type', v_qr.type, 'eventSlug', v_slug);
end;
$$;

grant execute on function qr_peek(text) to anon, authenticated;

notify pgrst, 'reload schema';
