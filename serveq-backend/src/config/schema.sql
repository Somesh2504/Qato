-- ============================================================
--  ServeQ — Supabase Database Schema
-- ============================================================
--
--  HOW TO USE:
--  1. Copy ALL of this SQL
--  2. Go to your Supabase project
--  3. Click "SQL Editor" in the left sidebar
--  4. Paste and click "Run"
--
--  REALTIME (for live order updates):
--  After running this SQL:
--  → Go to Supabase → Database → Replication
--  → Enable Realtime for the "orders" table
--  → This lets your dashboard receive live order events via subscription
--
-- ============================================================

-- ── 1. restaurants ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurants (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email         TEXT        UNIQUE NOT NULL,
  name                TEXT        NOT NULL,
  slug                TEXT        UNIQUE NOT NULL,   -- e.g. "biryani-palace"
  logo_url            TEXT,
  address             TEXT,
  phone               TEXT,
  opening_time        TEXT,                          -- e.g. "09:00"
  closing_time        TEXT,                          -- e.g. "22:00"
  default_prep_time   INTEGER     DEFAULT 10,        -- minutes
  is_accepting_orders BOOLEAN     DEFAULT TRUE,
  razorpay_key_id     TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ── 2. menu_categories ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  sort_order    INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 3. menu_items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id   UUID        NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  description   TEXT,
  price         NUMERIC     NOT NULL,
  photo_url     TEXT,
  is_veg        BOOLEAN     DEFAULT TRUE,
  is_available  BOOLEAN     DEFAULT TRUE,
  sort_order    INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 4. orders ─────────────────────────────────────────────────────────────────
-- status values       : pending | preparing | done | cancelled
-- payment_type values : upi | cash
-- payment_status      : pending | paid | refunded
CREATE TABLE IF NOT EXISTS orders (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id         UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  token_number          INTEGER     NOT NULL,
  status                TEXT        DEFAULT 'pending',
  payment_type          TEXT        NOT NULL,
  payment_status        TEXT        DEFAULT 'pending',
  total_amount          NUMERIC     NOT NULL,
  razorpay_order_id     TEXT,
  razorpay_payment_id   TEXT,
  estimated_wait_minutes INTEGER,
  customer_name         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ── 5. order_items ────────────────────────────────────────────────────────────
-- Snapshots of item name/price at order time so menu changes don't affect history
CREATE TABLE IF NOT EXISTS order_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id        UUID        REFERENCES menu_items(id),
  item_name           TEXT        NOT NULL,  -- snapshot
  item_price          NUMERIC     NOT NULL,  -- snapshot
  quantity            INTEGER     DEFAULT 1,
  customization_note  TEXT
);

-- ── 6. ratings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id UUID        REFERENCES restaurants(id),
  stars         INTEGER     NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 7. superadmins ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS superadmins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 8. transactions ──────────────────────────────────────────────────────────
-- Payment audit trail to track paid/failed/refunded entries from Razorpay.
CREATE TABLE IF NOT EXISTS transactions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID        REFERENCES orders(id) ON DELETE SET NULL,
  restaurant_id       UUID        REFERENCES restaurants(id) ON DELETE SET NULL,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  amount              NUMERIC     NOT NULL,
  currency            TEXT        NOT NULL DEFAULT 'INR',
  status              TEXT        NOT NULL,
  payment_method      TEXT,
  item_summary        JSONB,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes for common queries ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id      ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status             ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at         ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id  ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id    ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_ratings_restaurant_id     ON ratings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_superadmins_email          ON superadmins(email);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id      ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_restaurant_id ON transactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at    ON transactions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_payment_id
  ON transactions(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- ── Row Level Security (RLS) ─────────────────────────────────────────────────
-- IMPORTANT:
-- This policy set is "compatibility mode" for your current architecture where
-- customer flow uses Supabase directly from the frontend.
-- For stricter security, move customer order write/read to backend-only endpoints.

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.superadmins sa
    WHERE lower(sa.email) = lower(auth.email())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_restaurant_owner(p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND lower(r.owner_email) = lower(auth.email())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant_owner(UUID) TO anon, authenticated;

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Re-runnable policy cleanup
DROP POLICY IF EXISTS restaurants_public_read ON restaurants;
DROP POLICY IF EXISTS restaurants_owner_manage ON restaurants;

DROP POLICY IF EXISTS menu_categories_public_read ON menu_categories;
DROP POLICY IF EXISTS menu_categories_owner_manage ON menu_categories;

DROP POLICY IF EXISTS menu_items_public_read ON menu_items;
DROP POLICY IF EXISTS menu_items_owner_manage ON menu_items;

DROP POLICY IF EXISTS orders_public_read ON orders;
DROP POLICY IF EXISTS orders_public_insert ON orders;
DROP POLICY IF EXISTS orders_owner_manage ON orders;
DROP POLICY IF EXISTS orders_public_cancel_request ON orders;

DROP POLICY IF EXISTS order_items_public_read ON order_items;
DROP POLICY IF EXISTS order_items_public_insert ON order_items;
DROP POLICY IF EXISTS order_items_owner_manage ON order_items;

DROP POLICY IF EXISTS ratings_public_insert ON ratings;
DROP POLICY IF EXISTS ratings_owner_read ON ratings;

DROP POLICY IF EXISTS superadmins_self_read ON superadmins;
DROP POLICY IF EXISTS superadmins_admin_manage ON superadmins;

DROP POLICY IF EXISTS transactions_public_insert ON transactions;
DROP POLICY IF EXISTS transactions_owner_read ON transactions;

-- restaurants
CREATE POLICY restaurants_public_read
ON restaurants
FOR SELECT
USING (true);

CREATE POLICY restaurants_owner_manage
ON restaurants
FOR ALL
TO authenticated
USING (public.is_superadmin() OR lower(owner_email) = lower(auth.email()))
WITH CHECK (public.is_superadmin() OR lower(owner_email) = lower(auth.email()));

-- menu_categories
CREATE POLICY menu_categories_public_read
ON menu_categories
FOR SELECT
USING (true);

CREATE POLICY menu_categories_owner_manage
ON menu_categories
FOR ALL
TO authenticated
USING (public.is_superadmin() OR public.is_restaurant_owner(restaurant_id))
WITH CHECK (public.is_superadmin() OR public.is_restaurant_owner(restaurant_id));

-- menu_items
CREATE POLICY menu_items_public_read
ON menu_items
FOR SELECT
USING (true);

CREATE POLICY menu_items_owner_manage
ON menu_items
FOR ALL
TO authenticated
USING (public.is_superadmin() OR public.is_restaurant_owner(restaurant_id))
WITH CHECK (public.is_superadmin() OR public.is_restaurant_owner(restaurant_id));

-- orders (compatibility mode for customer tracking + placement)
CREATE POLICY orders_public_read
ON orders
FOR SELECT
USING (true);

CREATE POLICY orders_public_insert
ON orders
FOR INSERT
WITH CHECK (true);

CREATE POLICY orders_owner_manage
ON orders
FOR ALL
TO authenticated
USING (public.is_superadmin() OR public.is_restaurant_owner(restaurant_id))
WITH CHECK (public.is_superadmin() OR public.is_restaurant_owner(restaurant_id));

-- Allow customer cancellation request from public tracker page only
CREATE POLICY orders_public_cancel_request
ON orders
FOR UPDATE
TO anon, authenticated
USING (status = 'pending')
WITH CHECK (status = 'cancellation_requested');

-- order_items (compatibility mode)
CREATE POLICY order_items_public_read
ON order_items
FOR SELECT
USING (true);

CREATE POLICY order_items_public_insert
ON order_items
FOR INSERT
WITH CHECK (true);

CREATE POLICY order_items_owner_manage
ON order_items
FOR ALL
TO authenticated
USING (
  public.is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.id = order_items.order_id
      AND public.is_restaurant_owner(o.restaurant_id)
  )
)
WITH CHECK (
  public.is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.id = order_items.order_id
      AND public.is_restaurant_owner(o.restaurant_id)
  )
);

-- ratings
CREATE POLICY ratings_public_insert
ON ratings
FOR INSERT
WITH CHECK (true);

CREATE POLICY ratings_owner_read
ON ratings
FOR SELECT
TO authenticated
USING (public.is_superadmin() OR public.is_restaurant_owner(restaurant_id));

-- superadmins
CREATE POLICY superadmins_self_read
ON superadmins
FOR SELECT
TO authenticated
USING (public.is_superadmin());

CREATE POLICY superadmins_admin_manage
ON superadmins
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- transactions
CREATE POLICY transactions_public_insert
ON transactions
FOR INSERT
WITH CHECK (true);

CREATE POLICY transactions_owner_read
ON transactions
FOR SELECT
TO authenticated
USING (public.is_superadmin() OR public.is_restaurant_owner(restaurant_id));
