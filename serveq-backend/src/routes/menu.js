const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/authMiddleware');

// ── GET /api/menu/:slug (PUBLIC) ──────────────────────────────────────────────
// Full menu for the customer-facing page, keyed by restaurant slug
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  // 1. Fetch restaurant by slug
  const { data: restaurant, error: rErr } = await supabase
    .from('restaurants')
    .select('id, name, slug, logo_url, address, phone, opening_time, closing_time, is_accepting_orders, default_prep_time')
    .eq('slug', slug)
    .single();

  if (rErr || !restaurant) return res.status(404).json({ error: 'Restaurant not found' });

  // 2. Fetch categories + items in parallel
  const [catResult, itemResult] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_available', true)
      .order('sort_order', { ascending: true }),
  ]);

  if (catResult.error) return res.status(400).json({ error: catResult.error.message });

  // 3. Nest items under their category
  const categories = (catResult.data || []).map((cat) => ({
    ...cat,
    items: (itemResult.data || []).filter((item) => item.category_id === cat.id),
  }));

  res.json({ restaurant, categories });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CATEGORIES (protected)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/menu/category
router.post('/category', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  // Auto-assign sort_order as next available
  const { count } = await supabase
    .from('menu_categories')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', req.restaurant_id);

  const { data, error } = await supabase
    .from('menu_categories')
    .insert({ restaurant_id: req.restaurant_id, name, sort_order: count || 0 })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/menu/category/:id
router.put('/category/:id', authMiddleware, async (req, res) => {
  const { name, sort_order } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data, error } = await supabase
    .from('menu_categories')
    .update(updates)
    .eq('id', req.params.id)
    .eq('restaurant_id', req.restaurant_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/menu/category/:id
router.delete('/category/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('menu_categories')
    .delete()
    .eq('id', req.params.id)
    .eq('restaurant_id', req.restaurant_id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ITEMS (protected)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/menu/item
router.post('/item', authMiddleware, async (req, res) => {
  const { category_id, name, description, price, is_veg, photo_url } = req.body;

  if (!category_id || !name || price === undefined) {
    return res.status(400).json({ error: 'category_id, name and price are required' });
  }

  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      restaurant_id: req.restaurant_id,
      category_id,
      name,
      description: description || null,
      price,
      is_veg: is_veg !== undefined ? is_veg : true,
      photo_url: photo_url || null,
      is_available: true,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/menu/item/:id
router.put('/item/:id', authMiddleware, async (req, res) => {
  const allowed = ['category_id', 'name', 'description', 'price', 'is_veg', 'photo_url', 'is_available', 'sort_order'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data, error } = await supabase
    .from('menu_items')
    .update(updates)
    .eq('id', req.params.id)
    .eq('restaurant_id', req.restaurant_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PUT /api/menu/item/:id/availability — sold-out toggle
router.put('/item/:id/availability', authMiddleware, async (req, res) => {
  const { is_available } = req.body;

  if (is_available === undefined) {
    return res.status(400).json({ error: 'is_available is required' });
  }

  const { data, error } = await supabase
    .from('menu_items')
    .update({ is_available: Boolean(is_available) })
    .eq('id', req.params.id)
    .eq('restaurant_id', req.restaurant_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/menu/item/:id — soft delete (preserves order history)
router.delete('/item/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('menu_items')
    .update({ is_available: false })
    .eq('id', req.params.id)
    .eq('restaurant_id', req.restaurant_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true, item: data });
});

module.exports = router;
