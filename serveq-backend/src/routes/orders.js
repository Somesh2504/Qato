const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/authMiddleware');

// ── Razorpay lazy-init (shared with payments.js pattern) ────────────────────
let _razorpay = null;
const getRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret || keyId.startsWith('YOUR_') || keySecret.startsWith('YOUR_')) {
    throw new Error('Razorpay API keys are not configured. Please add valid keys to .env');
  }

  if (!_razorpay) {
    _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return _razorpay;
};

// ── Helper: Atomic token number via Supabase RPC ────────────────────────────
async function getNextTokenNumber(restaurant_id) {
  const { data, error } = await supabase.rpc('get_next_token_number', {
    p_restaurant_id: restaurant_id
  });

  if (error) {
    console.error('RPC get_next_token_number error:', error);
    // Emergency fallback: count today's orders + 1 (still server-side, not client)
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurant_id)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());
    return (count || 0) + 1;
  }
  return data;
}

// ── Helper: today range ─────────────────────────────────────────────────────
function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  POST /api/orders/checkout (PUBLIC — secure unified checkout)
//
//  This is the SINGLE entry point for all customer orders (UPI + Cash).
//  The server:
//    1. Validates the restaurant exists and is accepting orders
//    2. Fetches real prices from menu_items (prevents price spoofing)
//    3. Generates an atomic token number
//    4. Inserts order + order_items
//    5. For UPI: creates Razorpay order with Route transfer
//    6. Returns everything to the frontend
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/checkout', async (req, res) => {
  const { restaurant_id, payment_type, order_type, items, customer_name } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!restaurant_id || !payment_type || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'restaurant_id, payment_type and items[] are required' });
  }

  const validPaymentTypes = ['upi', 'cash'];
  if (!validPaymentTypes.includes(payment_type)) {
    return res.status(400).json({ error: `payment_type must be one of: ${validPaymentTypes.join(', ')}` });
  }

  // Validate each item has menu_item_id and quantity
  for (const item of items) {
    if (!item.menu_item_id || !item.quantity || item.quantity < 1) {
      return res.status(400).json({ error: 'Each item must have a valid menu_item_id and quantity >= 1' });
    }
  }

  try {
    // ── 1. Validate restaurant ────────────────────────────────────────────
    const { data: restaurant, error: rErr } = await supabase
      .from('restaurants')
      .select('id, name, is_accepting_orders, default_prep_time, razorpay_account_id')
      .eq('id', restaurant_id)
      .single();

    if (rErr || !restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    if (!restaurant.is_accepting_orders) {
      return res.status(400).json({ error: 'Restaurant is not accepting orders right now' });
    }

    // ── 2. Fetch real prices from database (anti-spoofing) ────────────────
    const menuItemIds = items.map(i => i.menu_item_id);

    const { data: menuItems, error: menuErr } = await supabase
      .from('menu_items')
      .select('id, name, price, is_available')
      .in('id', menuItemIds)
      .eq('restaurant_id', restaurant_id);

    if (menuErr) {
      console.error('[checkout] Menu fetch error:', menuErr);
      return res.status(500).json({ error: 'Failed to fetch menu data' });
    }

    // Build a lookup map: menu_item_id -> { name, price, is_available }
    const menuMap = new Map();
    for (const mi of (menuItems || [])) {
      menuMap.set(mi.id, mi);
    }

    // Validate every requested item exists and is available
    let serverTotal = 0;
    const validatedItems = [];

    for (const cartItem of items) {
      const dbItem = menuMap.get(cartItem.menu_item_id);
      if (!dbItem) {
        return res.status(400).json({
          error: `Menu item not found: ${cartItem.menu_item_id}. It may have been removed.`
        });
      }
      if (!dbItem.is_available) {
        return res.status(400).json({
          error: `"${dbItem.name}" is currently sold out. Please remove it from your cart.`
        });
      }

      const lineTotal = dbItem.price * cartItem.quantity;
      serverTotal += lineTotal;

      validatedItems.push({
        menu_item_id: dbItem.id,
        item_name: dbItem.name,
        item_price: dbItem.price,
        quantity: cartItem.quantity,
        customization_note: cartItem.customization_note || null,
      });
    }

    // Round to 2 decimal places to avoid floating-point drift
    serverTotal = Math.round(serverTotal * 100) / 100;

    // ── 3. Atomic token number ────────────────────────────────────────────
    const token_number = await getNextTokenNumber(restaurant_id);

    // ── 4. Insert order ───────────────────────────────────────────────────
    const orderPayload = {
      restaurant_id,
      token_number,
      payment_type,
      total_amount: serverTotal,
      customer_name: customer_name || null,
      status: 'pending',
      payment_status: 'pending',
      order_type: order_type || 'eat',
      estimated_wait_minutes: restaurant.default_prep_time || null,
    };

    // For UPI: we need to create the Razorpay order FIRST to get the order_id
    let razorpayOrderId = null;
    let razorpayAmount = null;

    if (payment_type === 'upi') {
      // Validate Route account is configured
      if (!restaurant.razorpay_account_id) {
        return res.status(400).json({
          error: 'This restaurant has not configured online payments yet. Please pay at the counter.'
        });
      }

      const razorpay = getRazorpay();
      const amountPaise = Math.round(serverTotal * 100);

      const rpOrderOptions = {
        amount: amountPaise,
        currency: 'INR',
        receipt: `serveq_${Date.now()}`,
        transfers: [
          {
            account: restaurant.razorpay_account_id,
            amount: amountPaise,
            currency: 'INR',
            notes: {
              name: `Transfer to ${restaurant.name}`,
              restaurant_id: restaurant.id
            },
            linked_account_notes: ['restaurant_id'],
            on_hold: 0
          }
        ]
      };

      const rpOrder = await razorpay.orders.create(rpOrderOptions);
      razorpayOrderId = rpOrder.id;
      razorpayAmount = rpOrder.amount;
      orderPayload.razorpay_order_id = razorpayOrderId;
    }

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();

    if (orderErr) {
      console.error('[checkout] Order insert error:', orderErr);
      return res.status(400).json({ error: orderErr.message });
    }

    // ── 5. Insert order items ─────────────────────────────────────────────
    const orderItemsPayload = validatedItems.map(item => ({
      ...item,
      order_id: order.id,
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsPayload);

    if (itemsErr) {
      // Rollback: delete the order we just created
      await supabase.from('orders').delete().eq('id', order.id);
      console.error('[checkout] Order items insert error:', itemsErr);
      return res.status(400).json({ error: itemsErr.message });
    }

    // ── 6. Build response ─────────────────────────────────────────────────
    const response = {
      orderId: order.id,
      tokenNumber: order.token_number,
      totalAmount: serverTotal,
      paymentType: payment_type,
    };

    if (payment_type === 'upi') {
      response.razorpay_order_id = razorpayOrderId;
      response.razorpay_amount = razorpayAmount;
    }

    res.status(201).json(response);
  } catch (err) {
    console.error('[checkout] Unhandled error:', err);

    // Razorpay-specific errors
    if (err.error?.description) {
      return res.status(err.statusCode || 500).json({ error: err.error.description });
    }

    // Config errors (missing keys)
    if (err.message && err.message.includes('not configured')) {
      return res.status(503).json({ error: err.message });
    }

    res.status(500).json({ error: 'Failed to process checkout' });
  }
});

// ── POST /api/orders (LEGACY — kept for backward compat but not used) ────────
router.post('/', async (req, res) => {
  const { restaurant_id, payment_type, total_amount, items, customer_name } = req.body;

  if (!restaurant_id || !payment_type || !items || !items.length) {
    return res.status(400).json({ error: 'restaurant_id, payment_type and items are required' });
  }

  try {
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
