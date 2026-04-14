// src/pages/onboarding/SignupPage.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ImagePlus,
  Mail,
  MapPin,
  Phone,
  Plus,
  Store,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { formatIndianPrice, generateSlug } from '../../utils/helpers';
import Button from '../../components/ui/Button';
import MenuAiScanner from '../../components/ui/MenuAiScanner';
import toast from 'react-hot-toast';

const TOTAL_STEPS = 4;

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const svgWrapRef = useRef(null);
  const logoInputRef = useRef(null);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — email/password
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otp, setOtp] = useState('');

  // Step 2 — restaurant profile
  const [shopName, setShopName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openingTime, setOpeningTime] = useState('09:00');
  const [closingTime, setClosingTime] = useState('22:00');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Step 3 — menu
  const [menuCategoryName, setMenuCategoryName] = useState('');
  const [menuItemName, setMenuItemName] = useState('');
  const [menuItemPrice, setMenuItemPrice] = useState('');
  const [menuItemVeg, setMenuItemVeg] = useState(true);
  const [draftCategories, setDraftCategories] = useState([]);
  const [draftItems, setDraftItems] = useState([]);
  const [selectedDraftCategory, setSelectedDraftCategory] = useState('');
  const [scanningMenu, setScanningMenu] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiReviewCategories, setAiReviewCategories] = useState([]);
  const [aiReviewItems, setAiReviewItems] = useState([]);

  // Auth session (set after step 1 OR loaded from Google OAuth sessionStorage)
  const [authToken, setAuthToken] = useState('');
  const [authUserEmail, setAuthUserEmail] = useState('');

  // Finalized summary (step 5)
  const [createdRestaurant, setCreatedRestaurant] = useState(null);

  // ── Detect Google OAuth redirect (step=2&via=google) ────────────────────
  const isGoogleFlow = searchParams.get('via') === 'google';

  useEffect(() => {
    if (isGoogleFlow) {
      // Read the token stashed by AuthCallbackPage
      try {
        const stored = sessionStorage.getItem('serveq_google_session');
        if (stored) {
          const { token, email: gEmail } = JSON.parse(stored);
          setAuthToken(token);
          setAuthUserEmail(gEmail);
          setEmail(gEmail); // pre-fill for display
          sessionStorage.removeItem('serveq_google_session'); // consume once
          setStep(2); // skip step 1
        } else {
          // No stashed session — something went wrong, restart
          navigate('/signup', { replace: true });
        }
      } catch {
        navigate('/signup', { replace: true });
      }
    }
  }, [isGoogleFlow, navigate]);

  const menuLink = useMemo(() => {
    const host = 'serveq.in';
    return `${host}/menu/${slug || 'your-restaurant'}`;
  }, [slug]);

  useEffect(() => {
    setSlug(generateSlug(shopName));
  }, [shopName]);

  useEffect(() => {
    if (step === 5) {
      confetti({
        particleCount: 180,
        spread: 90,
        origin: { y: 0.65 },
        colors: ['#FF6B35', '#1A1A2E', '#22C55E', '#F59E0B'],
      });
    }
  }, [step]);

  const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));

  const handleGoogleSignup = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `https://qato-1.onrender.com/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (oauthErr) throw oauthErr;
      // Redirect happens automatically.
    } catch (err) {
      toast.error(err?.message || 'Google sign-in failed');
      setGoogleLoading(false);
    }
  };

  // ── Step 1: Create account (email/password only) ─────────────────────────
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return setError('Email & password required');
    if (password.length < 8) return setError('Password must be at least 8 characters');

    setLoading(true);
    try {
      const supabase = getSupabaseClient();

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `https://qato-1.onrender.com/auth/callback`,
        },
      });
      if (signUpError) {
        const m = signUpError.message?.toLowerCase() || '';
        const looksLikeExisting =
          m.includes('already') || m.includes('registered') || m.includes('exists');
        if (looksLikeExisting) {
          const { data: existingLogin, error: existingErr } = await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });
          if (existingErr) {
            if (existingErr.message?.includes('Invalid login credentials')) {
              throw new Error('This email is already registered. Either the password is wrong, or you need to confirm your email before continuing.');
            }
            throw existingErr;
          }
          if (!existingLogin?.session?.access_token) {
            throw new Error('Could not sign in. Check your password or confirm your email.');
          }
          setAuthToken(existingLogin.session.access_token);
          setAuthUserEmail(trimmedEmail);
          setEmail(trimmedEmail);
          next();
          return;
        }
        throw signUpError;
      }

      // If "Confirm email" is OFF, Supabase returns a session here — use it (no second login call).
      if (signUpData?.session?.access_token) {
        setAuthToken(signUpData.session.access_token);
        setAuthUserEmail(trimmedEmail);
        setEmail(trimmedEmail);
        next();
        return;
      }

      // No session means "Confirm email" is ON (OTP requires verification).
      setIsVerifyingOtp(true);
      toast.success('Registration successful. Please check your email for the OTP.');

    } catch (err) {
      const msg = err.message || 'Signup failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    
    // Clean to ensure numbers only
    const cleanOtp = otp.replace(/\D/g, '').slice(0, 6);
    if (cleanOtp.length !== 6) return setError('OTP must be exactly 6 digits');

    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanOtp,
        type: 'signup'
      });

      if (verifyErr) throw verifyErr;
      if (!data?.session?.access_token) throw new Error('Failed to start session after OTP verification');

      setAuthToken(data.session.access_token);
      setAuthUserEmail(email.trim());
      next();
    } catch (err) {
      const msg = err.message || 'OTP Verification failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Logo upload ──────────────────────────────────────────────────────────
  const handleUploadLogo = async (file) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const supabase = getSupabaseClient();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `restaurants/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('restaurant-logos')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from('restaurant-logos').getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      toast.success('Logo uploaded');
    } catch {
      toast.error('Logo upload failed');
    } finally {
      setUploadingLogo(false);
    }
  };

  // ── Step 2: Save profile (just validate, move to step 3) ─────────────────
  const handleSaveProfileStep = async (e) => {
    e.preventDefault();
    if (!shopName.trim() || !phone.trim() || !address.trim()) {
      setError('Shop name, phone and address are required.');
      return;
    }
    setError('');
    next();
  };

  // ── Step 3: Draft menu helpers ───────────────────────────────────────────
  const addDraftCategory = () => {
    const name = menuCategoryName.trim();
    if (!name) return;
    if (draftCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Category already added');
      return;
    }
    const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const next = [...draftCategories, { id, name }];
    setDraftCategories(next);
    setMenuCategoryName('');
    if (!selectedDraftCategory) setSelectedDraftCategory(id);
  };

  const addDraftItem = () => {
    const name = menuItemName.trim();
    const price = Number(menuItemPrice);
    if (!name || Number.isNaN(price) || price <= 0 || !selectedDraftCategory) {
      toast.error('Item name, valid price and category are required');
      return;
    }
    setDraftItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        price,
        is_veg: menuItemVeg,
        category_id: selectedDraftCategory,
      },
    ]);
    setMenuItemName('');
    setMenuItemPrice('');
    setMenuItemVeg(true);
  };

  const removeDraftItem = (id) =>
    setDraftItems((prev) => prev.filter((x) => x.id !== id));

  const handleAiMenuResults = (result) => {
    const sourceCategories = Array.isArray(result?.categories) ? result.categories : [];
    const nextCategories = [];
    const nextItems = [];

    sourceCategories.forEach((category, categoryIndex) => {
      const categoryName = String(category?.name || `Category ${categoryIndex + 1}`).trim() || `Category ${categoryIndex + 1}`;
      const categoryId = `ai_cat_${Date.now()}_${categoryIndex}_${Math.random().toString(36).slice(2, 6)}`;
      nextCategories.push({ id: categoryId, name: categoryName });

      const items = Array.isArray(category?.items) ? category.items : [];
      items.forEach((item, itemIndex) => {
        const itemName = String(item?.name || '').trim();
        if (!itemName) return;
        nextItems.push({
          id: `ai_item_${Date.now()}_${categoryIndex}_${itemIndex}_${Math.random().toString(36).slice(2, 6)}`,
          name: itemName,
          price: Number(item?.price || 0),
          is_veg: item?.is_veg !== false,
          category_id: categoryId,
        });
      });
    });

    if (!nextCategories.length || !nextItems.length) {
      toast.error('No usable menu items were detected. Please try another photo or add items manually.');
      return;
    }

    setAiReviewCategories(nextCategories);
    setAiReviewItems(nextItems);
    setAiReviewOpen(true);
    toast.success('AI menu draft is ready for review');
  };

  const updateAiCategoryName = (categoryId, value) => {
    setAiReviewCategories((prev) => prev.map((category) => (
      category.id === categoryId ? { ...category, name: value } : category
    )));
  };

  const addAiCategory = () => {
    const categoryId = `ai_cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setAiReviewCategories((prev) => [...prev, { id: categoryId, name: 'New Category' }]);
  };

  const removeAiCategory = (categoryId) => {
    setAiReviewCategories((prev) => prev.filter((category) => category.id !== categoryId));
    setAiReviewItems((prev) => prev.filter((item) => item.category_id !== categoryId));
  };

  const updateAiItem = (itemId, field, value) => {
    setAiReviewItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, [field]: value } : item
    )));
  };

  const addAiItem = (categoryId) => {
    setAiReviewItems((prev) => [
      ...prev,
      {
        id: `ai_item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: 'New Item',
        price: 0,
        is_veg: true,
        category_id: categoryId,
      },
    ]);
  };

  const removeAiItem = (itemId) => {
    setAiReviewItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const confirmAiMenuDraft = () => {
    if (!aiReviewCategories.length || !aiReviewItems.length) {
      toast.error('Add at least one category and item before confirming');
      return;
    }

    setDraftCategories(aiReviewCategories.map((category) => ({ id: category.id, name: category.name })));
    setDraftItems(aiReviewItems.map((item) => ({ ...item })));
    setSelectedDraftCategory(aiReviewCategories[0]?.id || '');
    setAiReviewOpen(false);
    toast.success('AI menu added to your draft');
  };

  // ── Step 3 → 4: Persist everything to Supabase ──────────────────────────
  const completeOnboarding = async () => {
    if (!authToken) {
      setError('Session missing. Please restart signup.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const supabase = getSupabaseClient();

      // Unique slug check
      const slugCandidate = slug || generateSlug(shopName);
      const { data: existing } = await supabase
        .from('restaurants')
        .select('id')
        .eq('slug', slugCandidate)
        .maybeSingle();
      const finalSlug = existing?.id
        ? `${slugCandidate}-${Math.floor(Math.random() * 9999)}`
        : slugCandidate;

      // Insert restaurant
      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .insert({
          owner_email: authUserEmail || email,
          name: shopName.trim(),
          slug: finalSlug,
          phone: phone.trim(),
          address: address.trim(),
          logo_url: logoUrl || null,
          opening_time: openingTime,
          closing_time: closingTime,
          subscription_plan: 'Commission',
          subscription_start_date: new Date().toISOString(),
          subscription_end_date: null,
        })
        .select()
        .single();
      if (restaurantError || !restaurant)
        throw restaurantError || new Error('Failed to create restaurant');

      // Insert categories
      let createdCategories = [];
      if (draftCategories.length) {
        const catRows = draftCategories.map((c, idx) => ({
          restaurant_id: restaurant.id,
          name: c.name,
          sort_order: idx,
        }));
        const { data: cats, error: catErr } = await supabase
          .from('menu_categories')
          .insert(catRows)
          .select();
        if (catErr) throw catErr;
        createdCategories = cats || [];
      }

      // Insert items (map local draft category IDs → real Supabase IDs)
      if (draftItems.length && createdCategories.length) {
        const byName = new Map(createdCategories.map((c) => [c.name.toLowerCase(), c.id]));
        const localCatById = new Map(draftCategories.map((c) => [c.id, c.name]));
        const itemRows = draftItems
          .map((item, idx) => {
            const catName = localCatById.get(item.category_id) || '';
            const category_id = byName.get(catName.toLowerCase());
            if (!category_id) return null;
            return {
              restaurant_id: restaurant.id,
              category_id,
              name: item.name,
              price: item.price,
              is_veg: item.is_veg,
              is_available: true,
              sort_order: idx,
            };
          })
          .filter(Boolean);
        if (itemRows.length) {
          const { error: itemErr } = await supabase.from('menu_items').insert(itemRows);
          if (itemErr) throw itemErr;
        }
      }

      // Finalize auth context
      login(authToken, {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        email: authUserEmail || email,
      });

      setCreatedRestaurant({ ...restaurant, itemsCount: draftItems.length });
      setSlug(restaurant.slug);
      setStep(4);
    } catch (err) {
      setError(err?.message || 'Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  // ── QR download ──────────────────────────────────────────────────────────
  const downloadQr = () => {
    const svg = svgWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || 'serveq-menu'}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const progressPct = Math.round((step / TOTAL_STEPS) * 100);
  const cardCls = `w-full max-w-2xl bg-white border border-gray-100 rounded-2xl shadow-xl animate-fade-in-scale`;
  const inputCls = `w-full h-12 rounded-xl bg-white border-1.5 border-gray-200 px-3 text-sm text-[#1A1A2E] placeholder:text-gray-400 focus:outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/10 transition-all`;

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#FF6B35]/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#FF6B35]/5 blur-3xl" />
      </div>

      <div className={cardCls}>
        {/* Header + progress */}
        <div className="p-5 md:p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="QRAVE Logo" className="w-11 h-11 rounded-xl shadow-lg shadow-orange-500/20 object-cover" />
            <div>
              <h1 className="text-xl font-bold text-[#1A1A2E]" style={{fontFamily:"'Outfit','Inter',sans-serif"}}>QRAVE Onboarding</h1>
              <p className="text-xs text-gray-400">
                Step {step} of {TOTAL_STEPS}
                {isGoogleFlow && step === 2 && (
                  <span className="ml-2 text-[#FF6B35]">· Signed in with Google</span>
                )}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-2 bg-[#FF6B35] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm mt-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="p-5 md:p-6 text-[#1A1A2E]">
          {/* ── STEP 1: Account Creation ─────────────────────────── */}
          {step === 1 && (
            <form onSubmit={isVerifyingOtp ? handleVerifyOtp : handleCreateAccount} className="space-y-4">
              <h2 className="text-lg font-bold text-[#1A1A2E]">Step 1 — Account Creation</h2>
              
              {!isVerifyingOtp ? (
                <>
                  <button
                    type="button"
                    onClick={handleGoogleSignup}
                    disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-3 h-12 rounded-xl bg-white border-1.5 border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {googleLoading ? (
                      <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087C16.6582 14.0518 17.64 11.8264 17.64 9.2045z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1818l-2.9087-2.2582c-.8064.54-1.8382.8591-3.0477.8591-2.3427 0-4.3282-1.5818-5.0373-3.7109H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/>
                        <path d="M3.9627 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573A8.9962 8.9962 0 000 9c0 1.4523.3477 2.8268.9573 4.0418L3.9627 10.71z" fill="#FBBC05"/>
                        <path d="M9 3.5791c1.3214 0 2.5077.4545 3.4405 1.346l2.5814-2.5814C13.4627.8918 11.4255 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9627 7.29C4.6718 5.1609 6.6573 3.5791 9 3.5791z" fill="#EA4335"/>
                      </svg>
                    )}
                    {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400 uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5 font-medium">Owner Email</label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        className={`${inputCls} pl-9`}
                        placeholder="owner@restaurant.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5 font-medium">Password</label>
                    <div className="relative">
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type={showPw ? 'text' : 'password'}
                        className={`${inputCls} pr-10`}
                        placeholder="Minimum 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="pt-2 flex justify-end">
                    <Button type="submit" variant="primary" loading={loading}>
                      Continue
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 bg-green-50 border border-green-100 rounded-xl mb-4">
                    <p className="text-sm font-medium text-green-800">We've sent a 6-digit OTP to <strong>{email}</strong></p>
                    <p className="text-xs text-green-600 mt-1">Please enter the code below to verify your email address.</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5 font-medium">Enter OTP</label>
                    <input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      type="text"
                      inputMode="numeric"
                      className={inputCls}
                      placeholder="000000"
                    />
                  </div>
                  <div className="pt-2 flex items-center justify-between">
                    <Button type="button" variant="outline" onClick={() => setIsVerifyingOtp(false)}>
                      Back
                    </Button>
                    <Button type="submit" variant="primary" loading={loading} disabled={otp.length !== 6}>
                      Verify & Continue
                    </Button>
                  </div>
                </>
              )}
            </form>
          )}

          {/* ── STEP 2: Restaurant Profile ───────────────────────── */}
          {step === 2 && (
            <form onSubmit={handleSaveProfileStep} className="space-y-4">
              <h2 className="text-lg font-bold">Step 2 — Restaurant Profile</h2>
              {isGoogleFlow && (
                <div className="text-xs text-gray-500 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                  Signed in as <span className="text-[#1A1A2E] font-medium">{authUserEmail}</span> via Google.
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1.5 font-medium">Shop Name</label>
                <div className="relative">
                  <Store size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className={`${inputCls} pl-9`}
                    placeholder="Biryani Palace"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Your menu link: {menuLink}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">Phone</label>
                  <div className="relative">
                    <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={`${inputCls} pl-9`}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">Slug</label>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(generateSlug(e.target.value))}
                    className={inputCls}
                    placeholder="biryani-palace"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5 font-medium">Address</label>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3 top-3 text-gray-400" />
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={3}
                    className={`${inputCls} pl-9 py-2.5 h-auto`}
                    placeholder="Full shop address"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">Opening</label>
                  <input
                    type="time"
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">Closing</label>
                  <input
                    type="time"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5 font-medium">Logo (optional)</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus size={18} className="text-gray-400" />
                    )}
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleUploadLogo(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    loading={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload size={14} />
                    Upload Logo
                  </Button>
                </div>
              </div>
              <div className="pt-2 flex items-center justify-between">
                {/* Hide Back on Google flow — step 1 is complete via OAuth */}
                {!isGoogleFlow ? (
                  <Button type="button" variant="outline" onClick={prev}>
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" variant="primary">
                  Continue
                </Button>
              </div>
            </form>
          )}

          {/* ── STEP 3: Menu Setup ──────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold">Step 3 — Menu Setup Wizard</h2>
                  <p className="text-sm text-gray-500">Start with AI scan or build your menu manually.</p>
                </div>
                <div className="text-xs text-gray-400">
                  {draftCategories.length} categories · {draftItems.length} items ready
                </div>
              </div>

              <MenuAiScanner
                restaurantName={shopName}
                onScanComplete={handleAiMenuResults}
                onBusyChange={setScanningMenu}
              />

              {scanningMenu ? (
                <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-[#FF6B35] font-semibold animate-pulse">
                  Magic is happening… extracting categories and items from your menu photo.
                </div>
              ) : null}

              {aiReviewOpen ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-[#1A1A2E] text-white p-4 md:p-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.2em] text-white/50">Review AI Results</p>
                      <h3 className="text-xl font-bold mt-1">Check extracted categories and items</h3>
                      <p className="text-sm text-white/65 mt-1">
                        You can rename, add, remove, and correct prices before confirming.
                      </p>
                    </div>
                    <div className="text-xs text-white/50 bg-white/10 px-3 py-2 rounded-xl">
                      {aiReviewCategories.length} categories · {aiReviewItems.length} items
                    </div>
                  </div>

                  <div className="space-y-3">
                    {aiReviewCategories.map((category) => {
                      const categoryItems = aiReviewItems.filter((item) => item.category_id === category.id);
                      return (
                        <div key={category.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <input
                              value={category.name}
                              onChange={(e) => updateAiCategoryName(category.id, e.target.value)}
                              className={inputCls}
                            />
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => addAiItem(category.id)}>
                                <Plus size={14} />
                                Add Item
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-red-200 text-red-600 hover:bg-red-50"
                                onClick={() => removeAiCategory(category.id)}
                              >
                                <Trash2 size={14} />
                                Remove
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {categoryItems.map((item) => (
                              <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_120px_110px_auto] gap-2 items-center">
                                <input
                                  value={item.name}
                                  onChange={(e) => updateAiItem(item.id, 'name', e.target.value)}
                                  className={inputCls}
                                />
                                <input
                                  value={item.price}
                                  onChange={(e) => updateAiItem(item.id, 'price', Number(e.target.value))}
                                  type="number"
                                  min="0"
                                  className={inputCls}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateAiItem(item.id, 'is_veg', true)}
                                    className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                                      item.is_veg ? 'bg-green-600 border-green-600 text-white' : 'bg-gray-100 border-gray-200 text-gray-600'
                                    }`}
                                  >
                                    Veg
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateAiItem(item.id, 'is_veg', false)}
                                    className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                                      !item.is_veg ? 'bg-red-600 border-red-600 text-white' : 'bg-gray-100 border-gray-200 text-gray-600'
                                    }`}
                                  >
                                    Non-Veg
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeAiItem(item.id)}
                                  className="h-12 w-12 rounded-xl border border-gray-200 text-red-500 hover:bg-red-50 flex items-center justify-center"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <Button type="button" variant="outline" onClick={() => setAiReviewOpen(false)}>
                      Back to Manual Wizard
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={addAiCategory}>
                        <Plus size={14} />
                        Add Category
                      </Button>
                      <Button type="button" variant="primary" onClick={confirmAiMenuDraft}>
                        Confirm & Add
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
                    <p className="text-sm font-medium">Let's add your first category</p>
                    <div className="flex gap-2">
                      <input
                        value={menuCategoryName}
                        onChange={(e) => setMenuCategoryName(e.target.value)}
                        className={inputCls}
                        placeholder="e.g. Starters"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDraftCategory())}
                      />
                      <Button type="button" variant="primary" onClick={addDraftCategory}>
                        <Plus size={14} />
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {draftCategories.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedDraftCategory(c.id)}
                          className={`px-3 py-1.5 rounded-full text-xs border ${
                            selectedDraftCategory === c.id
                              ? 'bg-[#FF6B35] border-[#FF6B35] text-white'
                              : 'bg-gray-100 border-gray-200 text-gray-700'
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
                    <p className="text-sm font-medium">Add your first item</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        value={menuItemName}
                        onChange={(e) => setMenuItemName(e.target.value)}
                        className={inputCls}
                        placeholder="Item name"
                      />
                      <input
                        value={menuItemPrice}
                        onChange={(e) => setMenuItemPrice(e.target.value)}
                        type="number"
                        className={inputCls}
                        placeholder="Price ₹"
                      />
                      <select
                        value={selectedDraftCategory}
                        onChange={(e) => setSelectedDraftCategory(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Select category</option>
                        {draftCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMenuItemVeg(true)}
                          className={`px-3 py-1.5 rounded-lg text-xs ${
                            menuItemVeg ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          Veg
                        </button>
                        <button
                          type="button"
                          onClick={() => setMenuItemVeg(false)}
                          className={`px-3 py-1.5 rounded-lg text-xs ${
                            !menuItemVeg ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          Non-Veg
                        </button>
                      </div>
                      <Button type="button" variant="primary" onClick={addDraftItem}>
                        <Plus size={14} />
                        Add Item
                      </Button>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {draftItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-2.5 py-1.5"
                        >
                          <span>
                            {item.name} · {formatIndianPrice(item.price)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDraftItem(item.id)}
                            className="text-red-500 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-gray-400">
                    Progress: {draftCategories.length} categories · {draftItems.length} items
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2">
                    <Button type="button" variant="outline" onClick={prev}>
                      Back
                    </Button>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={completeOnboarding} loading={loading}>
                        Skip for now
                      </Button>
                      <Button type="button" variant="primary" onClick={completeOnboarding} loading={loading}>
                        Finish Setup
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STEP 4: Go Live ─────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">Step 4 — Go Live!</h2>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2 text-sm">
                <p>
                  <span className="text-gray-500">Restaurant:</span>{' '}
                  {createdRestaurant?.name || shopName}
                </p>
                <p>
                  <span className="text-gray-500">Slug:</span>{' '}
                  {createdRestaurant?.slug || slug}
                </p>
                <p>
                  <span className="text-gray-500">Items:</span>{' '}
                  {createdRestaurant?.itemsCount ?? draftItems.length}
                </p>
              </div>
              <div className="bg-white p-4 rounded-2xl inline-block" ref={svgWrapRef}>
                <QRCodeSVG
                  value={`https://${menuLink}`}
                  size={210}
                  fgColor="#1A1A2E"
                  bgColor="#FFFFFF"
                />
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={downloadQr}>
                  Download QR Code
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => navigate('/admin/orders')}
                >
                  <CheckCircle2 size={16} />
                  Go to My Dashboard
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 md:px-6 md:pb-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-[#FF6B35] font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}