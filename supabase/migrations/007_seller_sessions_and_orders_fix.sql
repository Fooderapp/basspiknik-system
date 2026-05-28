-- Migration 007: Fix seller_sessions columns + orders currency default
-- Adds missing columns that the seller API uses

-- ─── seller_sessions ────────────────────────────────────────────────────────
-- Rename sold/revenue columns to match API expectations
ALTER TABLE public.seller_sessions
  RENAME COLUMN IF EXISTS tickets_sold TO total_sold;

ALTER TABLE public.seller_sessions
  RENAME COLUMN IF EXISTS total_amount TO total_revenue;

-- Add payment_method + notes if they don't exist
ALTER TABLE public.seller_sessions
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS notes text;

-- ─── orders ─────────────────────────────────────────────────────────────────
-- Ensure currency column exists and defaults to EUR
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'eur';

-- Back-fill existing rows that still say 'usd'
UPDATE public.orders SET currency = 'eur' WHERE currency = 'usd';
