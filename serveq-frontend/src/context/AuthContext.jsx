import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';

const AuthContext = createContext(null);

const TOKEN_KEY = 'serveq_token';
const RESTAURANT_KEY = 'serveq_restaurant';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState(null);
  const [restaurantSlug, setRestaurantSlug] = useState(null);
  const [email, setEmail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase, setSupabase] = useState(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState(null);
  const [subscriptionEndDate, setSubscriptionEndDate] = useState(null);

  useEffect(() => {
    let sb = null;
    try {
      sb = getSupabaseClient();
      setSupabase(sb);
    } catch (err) {
      console.error('Supabase init error:', err);
      setIsLoading(false);
      return;
    }

    const restoreSession = async () => {
      try {
        const { data, error } = await sb.auth.getSession();
        if (error) throw error;
        const session = data?.session;
        const savedRestaurant = localStorage.getItem(RESTAURANT_KEY);

        if (session?.access_token) {
          setToken(session.access_token);
        } else {
          setToken(null);
        }

        if (savedRestaurant) {
          const parsed = JSON.parse(savedRestaurant);
          setRestaurantId(parsed.id || null);
          setRestaurantName(parsed.name || null);
          setRestaurantSlug(parsed.slug || null);
          setEmail(parsed.email || null);
        } else if (session?.user?.email) {
          setEmail(session.user.email);
        }

        // Check superadmin status
        const userEmail = session?.user?.email;
        if (userEmail) {
          try {
            const { data: saRow } = await sb
              .from('superadmins')
              .select('id')
              .eq('email', userEmail)
              .maybeSingle();
            setIsSuperadmin(Boolean(saRow));
          } catch { setIsSuperadmin(false); }

          // Fetch subscription info for the restaurant owner
          try {
            const { data: restRow } = await sb
              .from('restaurants')
              .select('subscription_plan, subscription_end_date')
              .eq('owner_email', userEmail)
              .maybeSingle();
            if (restRow) {
              setSubscriptionPlan(restRow.subscription_plan || 'Free');
              setSubscriptionEndDate(restRow.subscription_end_date || null);
            }
          } catch { /* non-critical */ }
        }
      } catch (err) {
        console.error('AuthContext restore error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();

    const { data: authListener } = sb.auth.onAuthStateChange((_event, session) => {
      const nextToken = session?.access_token || null;
      setToken(nextToken);
      if (!session) {
        setRestaurantId(null);
        setRestaurantName(null);
        setRestaurantSlug(null);
        setEmail(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(RESTAURANT_KEY);
        return;
      }
      if (nextToken) {
        localStorage.setItem(TOKEN_KEY, nextToken);
      }
      if (session.user?.email) {
        setEmail(session.user.email);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const login = useCallback((authToken, restaurantData) => {
    setToken(authToken || null);
    setRestaurantId(restaurantData?.id || null);
    setRestaurantName(restaurantData?.name || null);
    setRestaurantSlug(restaurantData?.slug || null);
    setEmail(restaurantData?.email || null);

    if (authToken) {
      localStorage.setItem(TOKEN_KEY, authToken);
    }
    localStorage.setItem(RESTAURANT_KEY, JSON.stringify({
      id: restaurantData?.id,
      name: restaurantData?.name,
      slug: restaurantData?.slug,
      email: restaurantData?.email,
    }));
  }, []);

  const logout = useCallback(async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setToken(null);
      setRestaurantId(null);
      setRestaurantName(null);
      setRestaurantSlug(null);
      setEmail(null);

      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(RESTAURANT_KEY);
    }
  }, [supabase]);

  const updateRestaurantInfo = useCallback((data) => {
    if (data.name) setRestaurantName(data.name);
    if (data.slug) setRestaurantSlug(data.slug);

    const saved = localStorage.getItem(RESTAURANT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify({ ...parsed, ...data }));
    }
  }, []);

  const value = {
    token,
    restaurantId,
    restaurantName,
    restaurantSlug,
    email,
    isLoggedIn: Boolean(token),
    isLoading,
    isSuperadmin,
    subscriptionPlan,
    subscriptionEndDate,
    login,
    logout,
    updateRestaurantInfo,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
