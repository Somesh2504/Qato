const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/authMiddleware');

// ── GET /api/orders/:orderId/modification-preview ───────────────────────────
// Calculates the price difference between current order and a proposed new cart
router.post('/:orderId/modification-preview', async (req, res) => {
  const { orderId } = req.params;
  const { newItems } = req.body; // Array of { menu_item_id, quantity, customization_note }

  if (!newItems || !Array.isArray(newItems)) {
    return res.status(400).json({ error: 'newItems array is required' });
  }

  try {
    // 1. Fetch current order total and status
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('total_amount, status')
      .eq('id', orderId)
      .single();

    if (oErr || !order) return res.status(404).json({ error: 'Order not found' });
    
    // Check if modification is allowed (only pending/preparing)
    if (!['pending', 'preparing'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot modify order in ${order.status} status` });
    }

    // 2. Fetch prices from the menu for the new items to ensure accuracy
    const itemIds = newItems.map(i => i.menu_item_id);
    const { data: menuItems, error: mErr } = await supabase
      .from('menu_items')
      .select('id, name, price')
      .in('id', itemIds);

    if (mErr) return res.status(400).json({ error: 'Could not fetch menu item prices' });

    // 3. Calculate new total
    let newTotal = 0;
    const itemsWithPrices = newItems.map(proposedItem => {
      const menuDetail = menuItems.find(m => m.id === proposedItem.menu_item_id);
      if (!menuDetail) throw new Error(`Item ${proposedItem.menu_item_id} not found in menu`);
      
      const subtotal = menuDetail.price * proposedItem.quantity;
      newTotal += subtotal;
      
      return {
        ...proposedItem,
        item_name: menuDetail.name,
        item_price: menuDetail.price
      };
    });

    const difference = newTotal - order.total_amount;

    res.json({
      currentTotal: order.total_amount,
      newTotal,
      difference,
      proposedItems: itemsWithPrices
    });
  } catch (err) {
    console.error('Modification preview error:', err);
    res.status(500).json({ error: err.message || 'Failed to calculate modification' });
  }
});

// ── POST /api/orders/:orderId/apply-modification ────────────────────────────
// Persists the changes. Handles "refund" or "neutral" mods immediately.
// If "topup", this might be called after a second payment success.
router.post('/:orderId/apply-modification', async (req, res) => {
  const { orderId } = req.params;
  const { items, newTotal } = req.body;

  try {
    // 1. Snapshot current items for history (optional but good)
    const { data: oldItems } = await supabase.from('order_items').select('*').eq('order_id', orderId);

    // 2. Clear old items
    const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', orderId);
    if (delErr) throw delErr;

    // 3. Insert new items
    const { error: insErr } = await supabase.from('order_items').insert(
      items.map(item => ({
        order_id: orderId,
        menu_item_id: item.menu_item_id,
        item_name: item.item_name,
        item_price: item.item_price,
        quantity: item.quantity,
        customization_note: item.customization_note
      }))
    );
    if (insErr) throw insErr;

    // 4. Update order total
    // We also update payment_status if it's a refund
    const updateData = {
      total_amount: newTotal,
      updated_at: new Date().toISOString()
    };

    const { data: updatedOrder, error: uErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (uErr) throw uErr;

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('Apply modification error:', err);
    res.status(500).json({ error: 'Failed to apply order modification' });
  }
});

module.exports = router;
