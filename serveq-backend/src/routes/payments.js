const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/authMiddleware');

// In-memory queue to prevent crashing node and avoiding Razorpay rate limits (e.g. 15 concurrent max)
const { default: PQueue } = require('p-queue');
const paymentQueue = new PQueue({ concurrency: 15 });

// Lightweight idempotency cache for create-order retries (e.g. flaky network).
const CREATE_ORDER_TTL_MS = 10 * 60 * 1000;
const createOrderCache = new Map();

function getCreateOrderCache(key) {
  const entry = createOrderCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    createOrderCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCreateOrderCache(key, value) {
  createOrderCache.set(key, {
    value,
    expiresAt: Date.now() + CREATE_ORDER_TTL_MS,
  });
}

async function upsertTransactionOnce(payload) {
  const paymentId = payload.razorpay_payment_id;
  if (!paymentId) {
    await supabase.from('transactions').insert(payload).select();
    return;
  }

  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('razorpay_payment_id', paymentId)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return;
  await supabase.from('transactions').insert(payload).select();
}

// Lazy-init Razorpay so server boots even when keys are empty
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

// ── POST /api/payments/create-order (PUBLIC) ──────────────────────────────────
router.post('/create-order', async (req, res) => {
  console.log('[create-order] Incoming request body:', req.body);
  const { amount, restaurant_id } = req.body;
  const idempotencyKey = req.headers['x-idempotency-key'];

  if (!amount || !restaurant_id) {
    console.error('[create-order] Missing fields - amount:', amount, 'restaurant_id:', restaurant_id);
    return res.status(400).json({ error: 'amount and restaurant_id are required' });
  }

  if (idempotencyKey) {
    const cached = getCreateOrderCache(idempotencyKey);
    if (cached) {
      return res.json(cached);
    }
  }

  try {
    // Validate restaurant exists and get route account id
    console.log('[create-order] Fetching restaurant ID:', restaurant_id);
    const { data: restaurant, error: rErr } = await supabase
      .from('restaurants')
      .select('id, name, razorpay_account_id')
      .eq('id', restaurant_id)
      .single();

    if (rErr) console.error('[create-order] DB Query Error:', rErr);

    if (rErr || !restaurant) {
      console.error('[create-order] Restaurant not found for ID:', restaurant_id);
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    console.log('[create-order] Restaurant found. data:', restaurant);

    if (!restaurant.razorpay_account_id) {
      console.error('[create-order] Missing razorpay_account_id for restaurant:', restaurant.id);
      return res.status(400).json({ error: 'Restaurant has not configured a payment receiving account (Razorpay Route)' });
    }

    const razorpay = getRazorpay();

    const rpOrderOptions = {
      amount: Math.round(amount * 100), // convert to paise
      currency: 'INR',
      receipt: `serveq_${Date.now()}`,
      transfers: [
        {
          account: restaurant.razorpay_account_id,
          amount: Math.round(amount * 100),
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

    console.log('[create-order] Sending to Razorpay:', JSON.stringify(rpOrderOptions, null, 2));

    // Place the outbound API request into the queue to avoid blowing up the event loop
    const rpOrder = await paymentQueue.add(() => razorpay.orders.create(rpOrderOptions));
    console.log('[create-order] Razorpay order created successfully:', rpOrder.id);

    const responseBody = {
      razorpay_order_id: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
    };

    if (idempotencyKey) {
      setCreateOrderCache(idempotencyKey, responseBody);
    }

    res.json(responseBody);
  } catch (err) {
    console.error('[create-order] Create Razorpay order error caught:', err);
    console.error('[create-order] Error message:', err.message);
    if (err.error) console.error('[create-order] Razorpay inner error:', err.error);
    
    if (err.message && err.message.includes('not configured')) {
      return res.status(503).json({ error: err.message });
    }
    
    const statusCode = err.statusCode || 500;
    // Relay the razorpay error description if available so the frontend can display it
    const errorDesc = err.error?.description || 'Failed to create payment order';
    
    res.status(statusCode).json({ error: errorDesc, details: err.error });
  }
});

// ── POST /api/payments/verify (PUBLIC) ───────────────────────────────────────
router.post('/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
  }

  try {
    // Verify HMAC-SHA256 signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const signatureValid = expectedSig === razorpay_signature;

    // Fetch the order to get details for the transaction record
    let orderData = null;
    let orderItems = [];

    if (order_id) {
      const { data: od } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', order_id)
        .single();
      if (od) {
        orderData = od;
        orderItems = od.order_items || [];
      }
    }

    // If no order_id was passed, try finding by razorpay_order_id
    if (!orderData) {
      const { data: od } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('razorpay_order_id', razorpay_order_id)
        .single();
      if (od) {
        orderData = od;
        orderItems = od.order_items || [];
      }
    }

    // Build item summary for the transaction record
    const itemSummary = orderItems.map((i) => ({
      name: i.item_name,
      qty: i.quantity,
      price: i.item_price,
    }));

    if (!signatureValid) {
      // Insert failed transaction
      await upsertTransactionOnce({
        order_id: orderData?.id || null,
        restaurant_id: orderData?.restaurant_id || null,
        razorpay_order_id,
        razorpay_payment_id,
        amount: orderData?.total_amount || 0,
        currency: 'INR',
        status: 'failed',
        payment_method: 'upi',
        item_summary: itemSummary,
      });

      return res.json({ success: false, error: 'Payment signature mismatch' });
    }

    if (orderData?.payment_status === 'paid') {
      const alreadySamePayment = orderData.razorpay_payment_id && orderData.razorpay_payment_id === razorpay_payment_id;
      if (alreadySamePayment || !orderData.razorpay_payment_id) {
        await upsertTransactionOnce({
          order_id: orderData.id,
          restaurant_id: orderData.restaurant_id,
          razorpay_order_id,
          razorpay_payment_id,
          amount: orderData.total_amount || 0,
          currency: 'INR',
          status: 'paid',
          payment_method: 'upi',
          item_summary: itemSummary,
        });
        return res.json({ success: true, order_id: orderData.id, idempotent: true });
      }

      return res.status(409).json({ error: 'Order is already marked as paid with a different payment id' });
    }

    // Signature is valid — mark the order as paid
    if (orderData) {
      await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          razorpay_payment_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderData.id);
    } else {
      // Fallback: update by razorpay_order_id
      await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          razorpay_payment_id,
          updated_at: new Date().toISOString(),
        })
        .eq('razorpay_order_id', razorpay_order_id);
    }

    // Insert successful transaction record
    await upsertTransactionOnce({
      order_id: orderData?.id || null,
      restaurant_id: orderData?.restaurant_id || null,
      razorpay_order_id,
      razorpay_payment_id,
      amount: orderData?.total_amount || 0,
      currency: 'INR',
      status: 'paid',
      payment_method: 'upi',
      item_summary: itemSummary,
    });

    res.json({ success: true, order_id: orderData?.id || null });
  } catch (err) {
    console.error('Payment verify error:', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// ── POST /api/payments/refund (protected) ────────────────────────────────────
router.post('/refund', authMiddleware, async (req, res) => {
  const { orderId, razorpay_payment_id } = req.body;

  if (!orderId || !razorpay_payment_id) {
    return res.status(400).json({ error: 'orderId and razorpay_payment_id are required' });
  }

  try {
    const razorpay = getRazorpay();

    // Issue refund via Razorpay (reverses transfers automatically on Route)
    const refund = await razorpay.payments.refund(razorpay_payment_id, {
      reverse_all: 1
    });

    // Update order in DB
    const { data, error } = await supabase
      .from('orders')
      .update({
        payment_status: 'refunded',
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('restaurant_id', req.restaurant_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Insert refund transaction
    await supabase.from('transactions').insert({
      order_id: orderId,
      restaurant_id: req.restaurant_id,
      razorpay_order_id: data?.razorpay_order_id || null,
      razorpay_payment_id,
      amount: data?.total_amount || 0,
      currency: 'INR',
      status: 'refunded',
      payment_method: 'upi',
      item_summary: [],
    }).select();

    res.json({ success: true, refund, order: data });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Refund failed' });
  }
});

module.exports = router;
