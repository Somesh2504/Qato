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

  // Auth session (set after step 1 OR loaded from Google OAuth sessionStorage)
  const [authToken, setAuthToken] = useState('');
  const [authUserEmail, setAuthUserEmail] = useState('');

  // Finalized summary (step 4)
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
    if (step === 4) {
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

      // No session: usually "Confirm email" is ON, or edge cases. Try password sign-in once.
      const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (loginErr) {
        const raw = loginErr.message || '';
        const isCredentialNoise =
          raw.includes('Invalid login credentials') || raw.includes('Invalid email or password');
        if (isCredentialNoise) {
          throw new Error(
            'We could not start a session yet. If Supabase has “Confirm email” enabled, open the link in the email we sent, then click Continue again. For local testing you can disable it under Authentication → Providers → Email.'
          );
        }
        throw loginErr;
      }
      if (!loginData?.session?.access_token) {
        throw new Error('No session returned. Try confirming your email or signing in.');
      }

      setAuthToken(loginData.session.access_token);
      setAuthUserEmail(trimmedEmail);
      setEmail(trimmedEmail);
      next();
    } catch (err) {
      const msg = err.message || 'Signup failed';
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
  const cardCls = `w-full max-w-2xl bg-white/6 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl`;
  const inputCls = `w-full h-11 rounded-xl bg-white/10 border border-white/20 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF6B35]`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] via-[#16213E] to-[#0F3460] p-4 md:p-6 flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#FF6B35]/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#FF6B35]/10 blur-3xl" />
      </div>

      <div className={cardCls}>
        {/* Header + progress */}
        <div className="p-5 md:p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#FF6B35] flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">ServeQ Onboarding</h1>
              <p className="text-xs text-white/50">
                Step {step} of {TOTAL_STEPS}
                {isGoogleFlow && step === 2 && (
                  <span className="ml-2 text-[#FF6B35]">· Signed in with Google</span>
                )}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-2 bg-[#FF6B35] rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          {error && <p className="text-red-300 text-sm mt-3">{error}</p>}
        </div>

        <div className="p-5 md:p-6 text-white">
          {/* ── STEP 1: Account Creation ─────────────────────────── */}
          {step === 1 && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <h2 className="text-lg font-bold">Step 1 — Account Creation</h2>
              <Button
                type="button"
                variant="outline"
                loading={googleLoading}
                onClick={handleGoogleSignup}
              >
                Continue with Google
              </Button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-white/40 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1.5">Owner Email</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
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
                <label className="block text-sm text-white/70 mb-1.5">Password</label>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
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
            </form>
          )}

          {/* ── STEP 2: Restaurant Profile ───────────────────────── */}
          {step === 2 && (
            <form onSubmit={handleSaveProfileStep} className="space-y-4">
              <h2 className="text-lg font-bold">Step 2 — Restaurant Profile</h2>
              {isGoogleFlow && (
                <div className="text-xs text-white/50 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                  Signed in as <span className="text-white/80">{authUserEmail}</span> via Google.
                </div>
              )}
              <div>
                <label className="block text-sm text-white/70 mb-1.5">Shop Name</label>
                <div className="relative">
                  <Store size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className={`${inputCls} pl-9`}
                    placeholder="Biryani Palace"
                  />
                </div>
                <p className="text-xs text-white/50 mt-1.5">Your menu link: {menuLink}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-white/70 mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={`${inputCls} pl-9`}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1.5">Slug</label>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(generateSlug(e.target.value))}
                    className={inputCls}
                    placeholder="biryani-palace"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1.5">Address</label>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3 top-3 text-white/40" />
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
                  <label className="block text-sm text-white/70 mb-1.5">Opening</label>
                  <input
                    type="time"
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1.5">Closing</label>
                  <input
                    type="time"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1.5">Logo (optional)</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-white/10 overflow-hidden flex items-center justify-center">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus size={18} className="text-white/40" />
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
              <h2 className="text-lg font-bold">Step 3 — Menu Setup Wizard</h2>
              <div className="bg-white/8 border border-white/10 rounded-xl p-3 space-y-2">
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
                      onClick={() => setSelectedDraftCategory(c.id)}
                      className={`px-3 py-1.5 rounded-full text-xs border ${
                        selectedDraftCategory === c.id
                          ? 'bg-[#FF6B35] border-[#FF6B35]'
                          : 'bg-white/10 border-white/20'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/8 border border-white/10 rounded-xl p-3 space-y-2">
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
                        menuItemVeg ? 'bg-green-600 text-white' : 'bg-white/10 text-white/70'
                      }`}
                    >
                      Veg
                    </button>
                    <button
                      type="button"
                      onClick={() => setMenuItemVeg(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs ${
                        !menuItemVeg ? 'bg-red-600 text-white' : 'bg-white/10 text-white/70'
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
                      className="flex items-center justify-between text-sm bg-white/8 rounded-lg px-2.5 py-1.5"
                    >
                      <span>
                        {item.name} · {formatIndianPrice(item.price)}
                      </span>
                      <button
                        onClick={() => removeDraftItem(item.id)}
                        className="text-red-300 hover:text-red-200"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-xs text-white/50">
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
            </div>
          )}

          {/* ── STEP 4: Go Live ─────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">Step 4 — Go Live!</h2>
              <div className="bg-white/8 border border-white/10 rounded-xl p-3 space-y-2 text-sm">
                <p>
                  <span className="text-white/60">Restaurant:</span>{' '}
                  {createdRestaurant?.name || shopName}
                </p>
                <p>
                  <span className="text-white/60">Slug:</span>{' '}
                  {createdRestaurant?.slug || slug}
                </p>
                <p>
                  <span className="text-white/60">Items:</span>{' '}
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

        <div className="px-5 pb-5 md:px-6 md:pb-6 text-center text-sm text-white/50">
          Already have an account?{' '}
          <Link to="/login" className="text-[#FF6B35]">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}