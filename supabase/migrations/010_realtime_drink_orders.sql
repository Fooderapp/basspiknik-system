-- Enable Supabase Realtime for drink_orders so the bartender app receives
-- live INSERT/UPDATE events via the postgres_changes channel.
alter publication supabase_realtime add table drink_orders;
