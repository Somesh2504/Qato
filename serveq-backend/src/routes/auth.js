// serveq-backend/src/routes/auth.js
/**
 * ARCHITECTURE NOTE
 * ─────────────────
 * Google OAuth is handled ENTIRELY on the frontend via Supabase client SDK.
 * This backend only handles:
 *   POST /api/auth/signup  → email/password account creation (service-key admin)
 *   POST /api/auth/login   → email/password login
 *
 * After Google OAuth, the frontend's AuthCallbackPage.jsx calls Supabase directly
 * to get the session — no backend round-trip needed.
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');
require('dotenv').config();

// ── Admin Supabase client (service key) ──────────────────────────────────────
let _adminClient = null;
const getAdminClient = () => {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _adminClient;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function ensureUniqueSlug(baseSlug) {
  const { data } = await supabase
    .from('restaurants')
    .select('slug')
    .eq('slug', baseSlug)
    .maybeSingle();
  if (!data) return baseSlug;
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${baseSlug}-${suffix}`;
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const {
    email,
    password,
    restaurantName,
    phone,
    address,
    openingTime,
    closingTime,
  } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const admin = getAdminClient();

    // 1. Create auth user (service-key bypasses email confirmation)
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // 2. Optionally create restaurant row
    let restaurant = null;
    if (restaurantName) {
      const baseSlug = generateSlug(restaurantName);
      const slug = await ensureUniqueSlug(baseSlug);

      const { data: inserted, error: restaurantError } = await admin
        .from('restaurants')
        .insert({
          owner_email: email,
          name: restaurantName,
          slug,
          phone: phone || null,
          address: address || null,
          opening_time: openingTime || null,
          closing_time: closingTime || null,
        })
        .select()
        .single();

      if (restaurantError) {
        // Rollback auth user
        await admin.auth.admin.deleteUser(authData.user.id);
        return res.status(400).json({ error: restaurantError.message });
      }

      restaurant = inserted;
    }

    // 3. Get session token for immediate login
    const { data: session, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) {
      return res.status(400).json({ error: sessionError.message });
    }

    return res.status(201).json({
      success: true,
      restaurantId: restaurant?.id || null,
      slug: restaurant?.slug || null,
      token: session.session.access_token,
    });
  } catch (err) {
    console.error('[ServeQ] Signup error:', err);
    return res.status(500).json({ error: 'Signup failed' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    // 1. Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });

    // 2. Fetch restaurant row
    const { data: restaurant, error: rErr } = await supabase
      .from('restaurants')
      .select('id, name, slug')
      .eq('owner_email', email)
      .maybeSingle();

    if (rErr) return res.status(500).json({ error: rErr.message });
    if (!restaurant) return res.status(404).json({ error: 'No restaurant found for this account' });

    return res.json({
      token: data.session.access_token,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      slug: restaurant.slug,
    });
  } catch (err) {
    console.error('[ServeQ] Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;