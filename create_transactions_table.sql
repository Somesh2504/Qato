-- ============================================================
-- TRANSACTIONS TABLE — Run this in Supabase SQL Editor
-- Go to: https://supabase.com/dashboard → Your Project → SQL Editor → New Query
-- Paste this entire script and click "Run"
-- ============================================================

-- 1) Create the transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id      UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  
  -- Razorpay identifiers
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  
  -- Payment details
  amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'INR',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method TEXT DEFAULT 'upi',
  
  -- Item details (JSONB array of {name, qty, price})
  item_summary  JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2) Enable Row Level Security
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 3) Allow public inserts (the backend uses anon key)
CREATE POLICY "Allow insert for all" ON public.transactions
  FOR INSERT WITH CHECK (true);

-- 4) Allow public reads (for order status page to show payment info)
CREATE POLICY "Allow read for all" ON public.transactions
  FOR SELECT USING (true);

-- 5) Allow updates (for refund status changes)
CREATE POLICY "Allow update for all" ON public.transactions
  FOR UPDATE USING (true);

-- 6) Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON public.transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_restaurant_id ON public.transactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_razorpay_order_id ON public.transactions(razorpay_order_id);

-- Done! ✅
SELECT 'transactions table created successfully!' AS result;
