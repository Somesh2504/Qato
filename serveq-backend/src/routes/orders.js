const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/authMiddleware');

// ── Helper: today's token number (Atomic RPC logic) ────────────────────────
async function getNextTokenNumber(restaurant_id) {
  // Use atomic RPC function to prevent race conditions during high concurrency
  const { data, error } = await supabase.rpc('get_next_token_number', {
    p_restaurant_id: restaurant_id
  });

  if (error) {
    console.error('RPC get_next_token_number error:', error);
    // Emergency fallback if RPC is not installed (prevents full crash)
    return Math.floor(Math.random() * 10000);
  }
  return data;
}

// ── Helper: date range from query param ──────────────────────────────────────
function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ── POST /api/orders (PUBLIC — customers place orders) ────────────────────────
router.post('/', async (req, res) => {
  const { restaurant_id, payment_type, total_amount, items, customer_name } = req.body;

  if (!restaurant_id || !payment_type || !items || !items.length) {
    return res.status(400).json({ error: 'restaurant_id, payment_type and items are required' });
  }

  try {
    // Verify restaurant is accepting orders
    const { data: restaurant, error: rErr } = await supabase
      .from('restaurants')
      .select('is_accepting_orders, default_prep_time')
      .eq('id', restaurant_id)
      .single();

    if (rErr || !restaurant) return res.status(404).json({ error: 'Restaurant not found' });
    if (!restaurant.is_accepting_orders) {
      return res.status(400).json({ error: 'Restaurant is not accepting orders right now' });
    }

    const token_number = await getNextTokenNumber(restaurant_id);

    // Insert order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        restaurant_id,
        token_number,
        payment_type,
        total_amount: total_amount || 0,
        customer_name: customer_name || null,
        status: 'pending',
        payment_status: 'pending',
        estimated_wait_minutes: restaurant.default_prep_time || null,
      })
      .select()
      .single();

    if (orderErr) return res.status(400).json({ error: orderErr.message });

    // Insert order items
    const orderItems = items.map((item) => ({
      order_id: order.id,
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      item_price: item.item_price,
      quantity: item.quantity || 1,
      customization_note: item.customization_note || null,
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(orderItems);
    if (itemsErr) return res.status(400).json({ error: itemsErr.message });

    res.status(201).json({ orderId: order.id, tokenNumber: order.token_number });
  } catch (err) {
    console.error('Place order error:', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// ── GET /api/orders/restaurant/all (protected) ────────────────────────────────
// Must be defined BEFORE /:orderId to avoid route shadowing
router.get('/restaurant/all', authMiddleware, async (req, res) => {
  const { start, end } = todayRange();

  const { data: orders, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('restaurant_id', req.restaurant_id)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: true }); // FCFS

  if (error) return res.status(400).json({ error: error.message });

  const active    = (orders || []).filter((o) => ['pending', 'preparing'].includes(o.status));
  const completed = (orders || []).filter((o) => ['done', 'cancelled'].includes(o.status));

  res.json({ active, completed });
});

// ── GET /api/orders/:orderId (PUBLIC — customer tracks order) ─────────────────
router.get('/:orderId', async (req, res) => {
  const { orderId } = req.params;

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (error || !order) return res.status(404).json({ error: 'Order not found' });

  // Count orders ahead (same restaurant, active, placed before this one)
  const { start, end } = todayRange();
  const { count: ordersAhead } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', order.restaurant_id)
    .in('status', ['pending', 'preparing'])
    .gte('created_at', start)
    .lte('created_at', end)
    .lt('created_at', order.created_at);

  res.json({
    order,
    orderItems: order.order_items,
    ordersAhead: ordersAhead || 0,
  });
});

// ── PUT /api/orders/:orderId/status (protected) ───────────────────────────────
router.put('/:orderId/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'preparing', 'done', 'cancelled'];

  if (!status || !valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.orderId)
    .eq('restaurant_id', req.restaurant_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── PUT /api/orders/:orderId/wait-time (protected) ────────────────────────────
router.put('/:orderId/wait-time', authMiddleware, async (req, res) => {
  const { estimated_wait_minutes } = req.body;

  if (estimated_wait_minutes === undefined) {
    return res.status(400).json({ error: 'estimated_wait_minutes is required' });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ estimated_wait_minutes, updated_at: new Date().toISOString() })
    .eq('id', req.params.orderId)
    .eq('restaurant_id', req.restaurant_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── POST /api/orders/:orderId/rating (PUBLIC) ─────────────────────────────────
router.post('/:orderId/rating', async (req, res) => {
  const { stars, comment } = req.body;

  if (!stars || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'stars must be between 1 and 5' });
  }

  // Fetch order to get restaurant_id
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('restaurant_id')
    .eq('id', req.params.orderId)
    .single();

  if (oErr || !order) return res.status(404).json({ error: 'Order not found' });

  const { data, error } = await supabase
    .from('ratings')
    .insert({
      order_id: req.params.orderId,
      restaurant_id: order.restaurant_id,
      stars,
      comment: comment || null,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ success: true, rating: data });
});

module.exports = router;
