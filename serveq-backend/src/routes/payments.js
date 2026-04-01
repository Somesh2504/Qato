const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/authMiddleware');

// Lazy-init Razorpay so server boots even when keys are empty
let _razorpay = null;
const getRazorpay = () => {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
};

// ── POST /api/payments/create-order (PUBLIC) ──────────────────────────────────
router.post('/create-order', async (req, res) => {
  const { amount, restaurant_id } = req.body;

  if (!amount || !restaurant_id) {
    return res.status(400).json({ error: 'amount and restaurant_id are required' });
  }

  try {
    // Fetch restaurant's Razorpay key (for future per-restaurant payments)
    const { data: restaurant, error: rErr } = await supabase
      .from('restaurants')
      .select('razorpay_key_id')
      .eq('id', restaurant_id)
      .single();

    if (rErr || !restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    const razorpay = getRazorpay();

    const rpOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // convert to paise
      currency: 'INR',
      receipt: `serveq_${Date.now()}`,
    });

    res.json({
      razorpay_order_id: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
    });
  } catch (err) {
    console.error('Create Razorpay order error:', err);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// ── POST /api/payments/verify (PUBLIC) ───────────────────────────────────────
router.post('/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
  }

  try {
    // Verify HMAC-SHA256 signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.json({ success: false, error: 'Signature mismatch' });
    }

    // Mark the order as paid using the razorpay_order_id stored on our order
    const { error } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        razorpay_payment_id,
        updated_at: new Date().toISOString(),
      })
      .eq('razorpay_order_id', razorpay_order_id);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
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

    // Issue refund via Razorpay
    const refund = await razorpay.payments.refund(razorpay_payment_id, {});

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

    res.json({ success: true, refund, order: data });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Refund failed' });
  }
});

module.exports = router;
