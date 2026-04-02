// src/pages/onboarding/LoginPage.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseClient } from '../../lib/supabaseClient';
import Button from '../../components/ui/Button';
import toast from 'react-hot-toast';

// Inline Google SVG icon (no extra dependency needed)
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087C16.6582 14.0518 17.64 11.8264 17.64 9.2045z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1818l-2.9087-2.2582c-.8064.54-1.8382.8591-3.0477.8591-2.3427 0-4.3282-1.5818-5.0373-3.7109H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/>
      <path d="M3.9627 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573A8.9962 8.9962 0 000 9c0 1.4523.3477 2.8268.9573 4.0418L3.9627 10.71z" fill="#FBBC05"/>
      <path d="M9 3.5791c1.3214 0 2.5077.4545 3.4405 1.346l2.5814-2.5814C13.4627.8918 11.4255 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9627 7.29C4.6718 5.1609 6.6573 3.5791 9 3.5791z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  // ── Email / Password Login ────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      return setError('Fill all fields');
    }

    setLoading(true);
    setError('');
    try {
      const supabase = getSupabaseClient();

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (authError) throw authError;
      if (!data?.user) throw new Error('Login succeeded, but no user was returned.');

      const { data: restaurant, error: rErr } = await supabase
        .from('restaurants')
        .select('id, name, slug, owner_email')
        .eq('owner_email', data.user.email)
        .maybeSingle();

      if (rErr) throw rErr;
      if (!restaurant) throw new Error('No restaurant found for this account.');

      login(data.session.access_token, {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        email: restaurant.owner_email,
      });
      navigate('/admin/orders');
    } catch (err) {
      console.error('Login failed:', err);
      const msg =
        err?.message ||
        err?.error_description ||
        'Login failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth Login ────────────────────────────────────────────────────
  // This triggers a redirect to Google. The response comes back to /auth/callback
  // which is handled by AuthCallbackPage.jsx
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `https://qato-1.onrender.com/auth/callback`,
          queryParams: {
            // Request offline access so refresh tokens work
            access_type: 'offline',
            prompt: 'select_account', // Always show account picker
          },
        },
      });
      if (error) throw error;
      // Page will redirect to Google — no further code runs here
    } catch (err) {
      toast.error(err.message || 'Google login failed');
      setGoogleLoading(false);
    }
  };

  const inputCls =
    'w-full h-11 rounded-xl bg-white/10 border border-white/20 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF6B35] transition-colors';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1A1A2E] via-[#16213E] to-[#0F3460] p-4">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#FF6B35]/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#FF6B35]/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-white/6 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FF6B35] flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">ServeQ</h1>
            <p className="text-xs text-white/50">Admin Login</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold text-white">Welcome back</h2>

          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 h-11 rounded-xl bg-white text-gray-800 text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/40 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Email</label>
              <input
                name="email"
                type="email"
                placeholder="owner@restaurant.com"
                value={form.email}
                onChange={handleChange}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-1.5">Password</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Your password"
                  value={form.password}
                  onChange={handleChange}
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <Button type="submit" variant="primary" loading={loading} fullWidth>
              Login with Email
            </Button>
          </form>

          <p className="text-center text-white/50 text-sm">
            No account?{' '}
            <Link to="/signup" className="text-[#FF6B35] hover:underline">
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}