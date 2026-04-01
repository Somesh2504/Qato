const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/authMiddleware');

// All analytics routes are protected
router.use(authMiddleware);

// ── Date range helper ─────────────────────────────────────────────────────────
function getDateRange(range) {
  const now = new Date();
  let start;

  switch (range) {
    case 'week': {
      start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'month': {
      start = new Date(now);
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'today':
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      break;
    }
  }

  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ── GET /api/analytics/summary?range=today|week|month ────────────────────────
router.get('/summary', async (req, res) => {
  const { range = 'today' } = req.query;
  const { start, end } = getDateRange(range);

  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, total_amount, payment_type, status, created_at, updated_at')
      .eq('restaurant_id', req.restaurant_id)
      .gte('created_at', start)
      .lte('created_at', end);

    if (error) return res.status(400).json({ error: error.message });

    const doneOrders  = (orders || []).filter((o) => o.status === 'done');
    const cashOrders  = doneOrders.filter((o) => o.payment_type === 'cash');
    const upiOrders   = doneOrders.filter((o) => o.payment_type === 'upi');

    const total_orders  = doneOrders.length;
    const total_revenue = doneOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const avg_order_value = total_orders > 0 ? total_revenue / total_orders : 0;

    // Average wait time = mean of (updated_at - created_at) for done orders, in minutes
    const waitTimes = doneOrders
      .filter((o) => o.updated_at && o.created_at)
      .map((o) => (new Date(o.updated_at) - new Date(o.created_at)) / 60000);

    const average_wait_time =
      waitTimes.length > 0
        ? parseFloat((waitTimes.reduce((s, t) => s + t, 0) / waitTimes.length).toFixed(1))
        : null;

    res.json({
      total_orders,
      total_revenue: parseFloat(total_revenue.toFixed(2)),
      average_order_value: parseFloat(avg_order_value.toFixed(2)),
      cash_orders: {
        count: cashOrders.length,
        amount: parseFloat(cashOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0).toFixed(2)),
      },
      upi_orders: {
        count: upiOrders.length,
        amount: parseFloat(upiOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0).toFixed(2)),
      },
      average_wait_time,
    });
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ── GET /api/analytics/top-items?range=today|week|month ──────────────────────
router.get('/top-items', async (req, res) => {
  const { range = 'today' } = req.query;
  const { start, end } = getDateRange(range);

  try {
    const { data, error } = await supabase
      .from('order_items')
      .select('item_name, item_price, quantity, orders!inner(restaurant_id, status, created_at)')
      .eq('orders.restaurant_id', req.restaurant_id)
      .eq('orders.status', 'done')
      .gte('orders.created_at', start)
      .lte('orders.created_at', end);

    if (error) return res.status(400).json({ error: error.message });

    // Aggregate client-side
    const itemMap = {};
    for (const row of data || []) {
      const key = row.item_name;
      if (!itemMap[key]) itemMap[key] = { item_name: key, count: 0, revenue: 0 };
      itemMap[key].count   += row.quantity;
      itemMap[key].revenue += parseFloat(row.item_price || 0) * row.quantity;
    }

    const top5 = Object.values(itemMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((i) => ({ ...i, revenue: parseFloat(i.revenue.toFixed(2)) }));

    res.json(top5);
  } catch (err) {
    console.error('Top items error:', err);
    res.status(500).json({ error: 'Failed to fetch top items' });
  }
});

// ── GET /api/analytics/hourly?range=week|month ────────────────────────────────
router.get('/hourly', async (req, res) => {
  const { range = 'week' } = req.query;
  const { start, end } = getDateRange(range);

  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('created_at')
      .eq('restaurant_id', req.restaurant_id)
      .eq('status', 'done')
      .gte('created_at', start)
      .lte('created_at', end);

    if (error) return res.status(400).json({ error: error.message });

    // Build heatmap matrix: { day (0=Sun), hour, count }
    const matrix = {};

    for (const order of orders || []) {
      const d = new Date(order.created_at);
      const key = `${d.getDay()}_${d.getHours()}`;
      matrix[key] = (matrix[key] || 0) + 1;
    }

    const result = Object.entries(matrix).map(([key, count]) => {
      const [day, hour] = key.split('_').map(Number);
      return { day, hour, count };
    });

    res.json(result);
  } catch (err) {
    console.error('Hourly analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch hourly data' });
  }
});

// ── GET /api/analytics/ratings-summary ───────────────────────────────────────
router.get('/ratings-summary', async (req, res) => {
  try {
    const { data: ratings, error } = await supabase
      .from('ratings')
      .select('stars, comment, created_at')
      .eq('restaurant_id', req.restaurant_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    const all = ratings || [];
    const average_stars =
      all.length > 0
        ? parseFloat((all.reduce((s, r) => s + r.stars, 0) / all.length).toFixed(2))
        : null;

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of all) distribution[r.stars] = (distribution[r.stars] || 0) + 1;

    const recent_comments = all
      .filter((r) => r.comment)
      .slice(0, 10)
      .map((r) => ({ stars: r.stars, comment: r.comment, created_at: r.created_at }));

    res.json({ average_stars, distribution, recent_comments });
  } catch (err) {
    console.error('Ratings summary error:', err);
    res.status(500).json({ error: 'Failed to fetch ratings summary' });
  }
});

// ── GET /api/analytics/order-history?page=1&limit=20&payment_type=&status= ───
router.get('/order-history', async (req, res) => {
  const { page = 1, limit = 20, payment_type, status } = req.query;
  const pageNum  = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const from = (pageNum - 1) * pageSize;
  const to   = from + pageSize - 1;

  try {
    let query = supabase
      .from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .eq('restaurant_id', req.restaurant_id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (payment_type) query = query.eq('payment_type', payment_type);
    if (status)       query = query.eq('status', status);

    const { data: orders, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({
      orders: orders || [],
      total: count || 0,
      page: pageNum,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    console.error('Order history error:', err);
    res.status(500).json({ error: 'Failed to fetch order history' });
  }
});

module.exports = router;
