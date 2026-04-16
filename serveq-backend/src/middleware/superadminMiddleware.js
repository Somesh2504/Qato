const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');

const superadminMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const normalizedEmail = (user.email || '').toLowerCase();
    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from('superadmins')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (adminErr) {
      return res.status(500).json({ error: 'Failed to verify superadmin role' });
    }

    if (!adminRow) {
      return res.status(403).json({ error: 'Superadmin access denied' });
    }

    req.user = user;
    req.superadmin = adminRow;
    return next();
  } catch (err) {
    console.error('Superadmin middleware error:', err);
    return res.status(401).json({ error: 'Token verification failed' });
  }
};

module.exports = superadminMiddleware;
