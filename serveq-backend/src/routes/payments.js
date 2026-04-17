const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/authMiddleware');

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Safe transaction insert — won't crash if the transactions table is missing
async function safeInsertTransaction(payload) {
  try {
    // Idempotency: skip if this payment_id was already recorded
    const paymentId = payload.razorpay_payment_id;
    if (paymentId) {
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('razorpay_payment_id', paymentId)
        .limit(1)
        .maybeSingle();
      if (existing?.id) return; // already recorded
    }

    await supabase.from('transactions').insert(payload).select();
  } catch (err) {
    // Log but never crash the payment flow because of a transaction log failure
    console.warn('[transactions] Insert skipped (table may not exist):', err.message || err);
  }
}

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
      // Record failed transaction (non-blocking)
      await safeInsertTransaction({
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

    // Idempotency: if order is already paid with the same payment, return success
    if (orderData?.payment_status === 'paid') {
      const alreadySamePayment = orderData.razorpay_payment_id && orderData.razorpay_payment_id === razorpay_payment_id;
      if (alreadySamePayment || !orderData.razorpay_payment_id) {
        await safeInsertTransaction({
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

    // Insert successful transaction record (non-blocking)
    await safeInsertTransaction({
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

    // Insert refund transaction (non-blocking)
    await safeInsertTransaction({
      order_id: orderId,
      restaurant_id: req.restaurant_id,
      razorpay_order_id: data?.razorpay_order_id || null,
      razorpay_payment_id,
      amount: data?.total_amount || 0,
      currency: 'INR',
      status: 'refunded',
      payment_method: 'upi',
      item_summary: [],
    });

    res.json({ success: true, refund, order: data });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Refund failed' });
  }
});

module.exports = router;
