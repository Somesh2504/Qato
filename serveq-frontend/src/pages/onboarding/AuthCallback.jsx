// src/pages/onboarding/AuthCallback.jsx
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

/**
 * Google OAuth lands here after redirect.
 * Flow:
 *   1. Supabase auto-exchanges the URL hash/code for a session.
 *   2. We read that session.
 *   3. We look up (or create) the restaurant row for this Google user.
 *   4. We call login() from AuthContext and redirect to /admin/orders.
 *
 * Mount this at: <Route path="/auth/callback" element={<AuthCallback />} />
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const ranOnce = useRef(false); // prevent StrictMode double-run

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const handleCallback = async () => {
      const supabase = getSupabaseClient();

      // Supabase JS v2 automatically parses the URL hash/code and sets the session.
      // getSession() will return the newly-created session right after redirect.
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        const msg = sessionError?.message || 'Google login failed. Please try again.';
        toast.error(msg);
        navigate('/login');
        return;
      }

      const userEmail = session.user.email;
      const token = session.access_token;

      // Check if a restaurant row already exists for this Google user
      const { data: existingRestaurant, error: fetchError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('owner_email', userEmail)
        .maybeSingle(); // use maybeSingle so it doesn't throw on 0 rows

      if (fetchError) {
        // If restaurants table is missing or blocked (RLS), don't dead-end:
        // continue to onboarding so the user can still create their restaurant.
        console.error('Failed to load restaurant data:', fetchError);
        const msg = fetchError?.message || 'Failed to load restaurant data.';
        toast.error(msg);
        sessionStorage.setItem('serveq_google_session', JSON.stringify({ token, email: userEmail }));
        navigate('/signup?via=google', { replace: true });
        return;
      }

      if (existingRestaurant) {
        // Returning Google user — go straight to dashboard
        login(token, existingRestaurant);
        navigate('/admin/orders');
      } else {
        // First-time Google user — they need to complete onboarding.
        // Stash session in a single key that SignupPage expects.
        sessionStorage.setItem('serveq_google_session', JSON.stringify({ token, email: userEmail }));
        toast.success('Account created! Let\'s set up your restaurant.');
        navigate('/signup?via=google');
      }
    };

    handleCallback();
  }, [login, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] via-[#16213E] to-[#0F3460] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-white">
        <img src="/logo.jpg" alt="QRAVE Logo" className="w-14 h-14 rounded-2xl animate-pulse object-cover" />
        <p className="text-lg font-semibold tracking-wide">Signing you in…</p>
        <p className="text-sm text-white/50">Hang tight, verifying with Google</p>
      </div>
    </div>
  );
}