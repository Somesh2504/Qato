const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/authMiddleware');

// All routes in this file are protected
router.use(authMiddleware);

// ── GET /api/restaurant/profile ───────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', req.restaurant_id)
    .single();

  if (error) return res.status(404).json({ error: 'Restaurant not found' });
  res.json(data);
});

// ── PUT /api/restaurant/profile ───────────────────────────────────────────────
router.put('/profile', async (req, res) => {
  const allowed = [
    'name', 'address', 'phone', 'logo_url',
    'opening_time', 'closing_time', 'default_prep_time',
    'razorpay_key_id', 'razorpay_account_id',
  ];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data, error } = await supabase
    .from('restaurants')
    .update(updates)
    .eq('id', req.restaurant_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── PUT /api/restaurant/toggle-orders ────────────────────────────────────────
router.put('/toggle-orders', async (req, res) => {
  // Fetch current value
  const { data: current, error: fetchError } = await supabase
    .from('restaurants')
    .select('is_accepting_orders')
    .eq('id', req.restaurant_id)
    .single();

  if (fetchError) return res.status(400).json({ error: fetchError.message });

  const newValue = !current.is_accepting_orders;

  const { data, error } = await supabase
    .from('restaurants')
    .update({ is_accepting_orders: newValue })
    .eq('id', req.restaurant_id)
    .select('is_accepting_orders')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ is_accepting_orders: data.is_accepting_orders });
});

// ── GET /api/restaurant/qr-data ───────────────────────────────────────────────
router.get('/qr-data', async (req, res) => {
  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .select('slug')
    .eq('id', req.restaurant_id)
    .single();

  if (error) return res.status(404).json({ error: 'Restaurant not found' });

  const slug = restaurant.slug;
  const menuUrl = `https://serveq.in/menu/${slug}`;

  res.json({ menuUrl, slug });
});

module.exports = router;
