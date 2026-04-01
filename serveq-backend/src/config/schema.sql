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

-- ── Indexes for common queries ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id      ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status             ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at         ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id  ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id    ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_ratings_restaurant_id     ON ratings(restaurant_id);
