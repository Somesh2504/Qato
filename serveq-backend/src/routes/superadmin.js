const express = require('express');
const superadminMiddleware = require('../middleware/superadminMiddleware');
const supabaseAdmin = require('../config/supabaseAdmin');

const router = express.Router();

router.use(superadminMiddleware);

router.get('/me', async (req, res) => {
  return res.json({
    ok: true,
    email: req.superadmin.email,
    userId: req.user.id,
  });
});

router.get('/restaurants', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('restaurants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ restaurants: data || [] });
  } catch (err) {
    console.error('Superadmin restaurants fetch error:', err);
    return res.status(500).json({ error: 'Failed to load restaurants' });
  }
});

router.get('/admins', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('superadmins')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ admins: data || [] });
  } catch (err) {
    console.error('Superadmin admin list fetch error:', err);
    return res.status(500).json({ error: 'Failed to load superadmins' });
  }
});

router.post('/admins', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from('superadmins')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing?.id) {
      return res.status(409).json({ error: 'This email is already a superadmin' });
    }

    const { data, error } = await supabaseAdmin
      .from('superadmins')
      .insert({ email })
      .select('*')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ admin: data });
  } catch (err) {
    console.error('Superadmin add admin error:', err);
    return res.status(500).json({ error: 'Failed to add superadmin' });
  }
});

router.delete('/admins/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: target, error: targetErr } = await supabaseAdmin
      .from('superadmins')
      .select('id, email')
      .eq('id', id)
      .maybeSingle();

    if (targetErr) return res.status(400).json({ error: targetErr.message });
    if (!target) return res.status(404).json({ error: 'Superadmin not found' });

    if (target.email === req.superadmin.email) {
      return res.status(400).json({ error: "You can't remove yourself" });
    }

    const { error } = await supabaseAdmin.from('superadmins').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });

    return res.json({ success: true });
  } catch (err) {
    console.error('Superadmin remove admin error:', err);
    return res.status(500).json({ error: 'Failed to remove superadmin' });
  }
});

module.exports = router;
