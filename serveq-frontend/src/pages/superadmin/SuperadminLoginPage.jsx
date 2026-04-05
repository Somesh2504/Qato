// src/pages/superadmin/SuperadminLoginPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabaseClient';
import Button from '../../components/ui/Button';
import toast from 'react-hot-toast';

const ALLOWED_EMAIL = import.meta.env.VITE_SUPERADMIN_EMAIL;
const ALLOWED_PASSWORD = import.meta.env.VITE_SUPERADMIN_PASSWORD;

export default function SuperadminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      return setError('Email and password are required.');
    }

    // ── GATE: Check against fixed env credentials ──
    if (trimmedEmail !== ALLOWED_EMAIL?.toLowerCase() || password !== ALLOWED_PASSWORD) {
      setError('Access denied. Invalid credentials.');
      toast.error('Access denied.');
      return;
    }

    setLoading(true);
    try {
      // Sign in via Supabase Auth to get a session for database queries
      const supabase = getSupabaseClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authError) {
        throw new Error('Auth failed. Make sure this email has a Supabase Auth account with the same password.');
      }

      // Mark superadmin session
      sessionStorage.setItem('qato_superadmin', 'true');

      toast.success('Welcome, Superadmin!');
      navigate('/superadmin/dashboard');

    } catch (err) {
      setError(err?.message || 'Login failed');
      toast.error(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full h-12 rounded-xl bg-gray-50 border border-gray-200 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#FF6B35]/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#FF6B35]/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#e04e1a] flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Crown size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Outfit','Inter',sans-serif" }}>
              QRAVE Superadmin
            </h1>
            <p className="text-xs text-gray-500">Restricted Access</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Security badge */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
            <ShieldCheck size={16} className="text-red-500" />
            <p className="text-xs text-red-600">
              This panel is restricted to authorized superadmins only. Unauthorized access attempts are logged.
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="admin@qato.com"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1.5 font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-10`}
                  placeholder="Enter superadmin password"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" loading={loading} fullWidth>
                <ShieldCheck size={16} />
                Access Superadmin Panel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
