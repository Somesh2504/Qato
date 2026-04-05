import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Leaf, Minus, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { getSupabaseClient } from '../../lib/supabaseClient';
import { useCart } from '../../context/CartContext';
import { formatIndianPrice, formatTime } from '../../utils/helpers';

import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import Button from '../../components/ui/Button';

import { useSeoForCustomer } from '../../hooks/useSeoForCustomer';
import { useAddToHomeScreenPrompt } from '../../hooks/useAddToHomeScreenPrompt';
import { useSupabaseChannelReconnect } from '../../hooks/useSupabaseChannelReconnect';

export default function MenuPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { items, addItem, updateQuantity, getItemCount, getTotal, initializeCart } = useCart();

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]); // category names
  const [menuItems, setMenuItems] = useState([]); // normalized items

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'veg' | 'nonveg'
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);
  const [hasSessionOrders, setHasSessionOrders] = useState(false);

  const categoryRefs = useRef({});
  const headerRef = useRef(null);
  const fetchMenuDataRef = useRef(null);

  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const { promptOpen, setPromptOpen, trigger: triggerInstall } = useAddToHomeScreenPrompt({
    showDelayMs: 30000,
  });

  const isReconnecting = useSupabaseChannelReconnect({
    enabled: Boolean(supabase && restaurant?.id),
    buildChannel: (sb) =>
      sb
        .channel(`customer-menu:${restaurant?.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'menu_items',
            filter: `restaurant_id=eq.${restaurant?.id}`,
          },
          () => fetchMenuDataRef.current?.()
        ),
  });

  useSeoForCustomer({
    title: restaurant?.name ? `${restaurant.name} ΓÇö Order Online | QATO` : 'QATO ΓÇö Order Online',
    description: restaurant?.name
      ? `Order online from ${restaurant.name} on QATO. Fast pickup and transparent wait times.`
      : undefined,
    ogImageUrl: restaurant?.logo_url || undefined,
  });

  const fetchMenuData = async () => {
    if (!supabase) {
      setError('Supabase is not configured. Please try again.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { data: restaurantData, error: restErr } = await supabase
        .from('restaurants')
        .select(
          'id,name,slug,logo_url,address,phone,opening_time,closing_time,is_accepting_orders,default_prep_time'
        )
        .eq('slug', slug)
        .single();

      if (restErr || !restaurantData) throw new Error('Restaurant not found');

      const restaurantId = restaurantData.id;

      const [catRes, itemRes] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('id,name,sort_order')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('menu_items')
          .select(
            'id,category_id,name,description,price,is_veg,photo_url,is_available,sort_order'
          )
          .eq('restaurant_id', restaurantId)
          .eq('is_available', true)
          .order('sort_order', { ascending: true }),
      ]);

      if (catRes.error) throw catRes.error;
      if (itemRes.error) throw itemRes.error;

      const categoryRows = catRes.data || [];
      const categoryNames = categoryRows.map((c) => c.name);
      const categoryById = new Map(categoryRows.map((c) => [c.id, c.name]));

      const normalizedItems = (itemRes.data || []).map((item) => ({
        ...item,
        category: categoryById.get(item.category_id) || '',
        image_url: item.photo_url || item.image_url || null,
      }));

      setRestaurant(restaurantData);
      setCategories(['All', ...categoryNames]);
      setMenuItems(normalizedItems);

      initializeCart(restaurantId, slug, null, restaurantData.name || '');
      setActiveCategory('All');
    } catch (e) {
      setError(e?.message || 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuDataRef.current = fetchMenuData;
    fetchMenuData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    try {
      if (restaurant?.id) {
        const history = JSON.parse(localStorage.getItem('qato_session_orders') || '[]');
        const restOrders = history.filter(o => o.restaurant_id === restaurant.id);
        setHasSessionOrders(restOrders.length > 0);
      }
    } catch {}
  }, [restaurant?.id]);

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (filterType === 'veg' && !item.is_veg) return false;
      if (filterType === 'nonveg' && item.is_veg) return false;
      if (activeCategory !== 'All' && (item.category || 'Other') !== activeCategory) return false;
      if (
        search &&
        !item.name.toLowerCase().includes(search.toLowerCase()) &&
        !item.description?.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [menuItems, filterType, search, activeCategory]);

  const grouped = useMemo(() => {
    const catsToRender = activeCategory === 'All' ? categories.filter(c => c !== 'All') : [activeCategory];
    
    const byCat = catsToRender.reduce((acc, cat) => {
      const catItems = filteredItems.filter((i) => (i.category || 'Other') === cat);
      if (catItems.length > 0) acc[cat] = catItems;
      return acc;
    }, {});

    if (activeCategory === 'All' || activeCategory === 'Other') {
       const uncategorized = filteredItems.filter((i) => !i.category || !categories.includes(i.category));
       if (uncategorized.length > 0) byCat.Other = uncategorized;
    }
    return byCat;
  }, [categories, filteredItems, activeCategory]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    menuItems.forEach(item => {
      if (filterType === 'veg' && !item.is_veg) return;
      if (filterType === 'nonveg' && item.is_veg) return;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !item.description?.toLowerCase().includes(search.toLowerCase())) return;
      
      const c = item.category || 'Other';
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }, [menuItems, filterType, search]);

  const cartCount = getItemCount();
  const cartTotal = getTotal();

  const getQuantity = (itemId) => items.find((i) => i.id === itemId)?.quantity || 0;

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdd = (item) => {
    addItem(item);
    toast.success(`${item.name} added!`, {
      duration: 1500,
      position: 'bottom-center',
      style: { background: '#1A1A2E', color: 'white', borderRadius: '12px', fontSize: '14px' },
    });
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <EmptyState
          icon="≡ƒì╜∩╕Å"
          title={error === 'Restaurant not found' ? 'Restaurant not found' : 'Could not load menu'}
          description="Please check your connection and try again."
          actionLabel="Retry"
          onAction={fetchMenuData}
          compact
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      <div ref={headerRef} className="sticky top-0 z-20 bg-white shadow-sm">
        {!loading && restaurant && (
          <div className="bg-gradient-to-r from-[#1A1A2E] to-[#16213E] px-4 pt-5 pb-4">
            <h1 className="text-xl font-bold text-white">{restaurant.name}</h1>
            <div className="flex flex-wrap items-center justify-between mt-1.5 gap-2">
              <div className="flex items-center gap-2 text-white/60 text-xs flex-wrap">
                {restaurant.cuisine_type && <span>{restaurant.cuisine_type}</span>}
                {restaurant.cuisine_type && restaurant.opening_time && <span>·</span>}
                {restaurant.opening_time && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {restaurant.opening_time} – {restaurant.closing_time}
                  </span>
                )}
              </div>
              {hasSessionOrders && (
                <button
                  onClick={() => {
                    try {
                      const history = JSON.parse(localStorage.getItem('qato_session_orders') || '[]');
                      const restOrders = history.filter(o => o.restaurant_id === restaurant?.id);
                      if (restOrders.length > 0) {
                        const active = restOrders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
                        navigate(`/order/${active.id}`);
                      }
                    } catch {}
                  }}
                  className="text-white text-xs font-extrabold px-4 py-2 bg-[#FF6B35] rounded-full hover:bg-[#E55A24] transition-all flex-shrink-0 shadow-md shadow-black/20 tracking-wide"
                >
                  Your Orders
                </button>
              )}
            </div>
          </div>
        )}

        {isReconnecting ? (
          <div className="px-4 py-2">
            <p className="text-xs text-[#FF6B35] font-semibold">ReconnectingΓÇª</p>
          </div>
        ) : null}

        <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishesΓÇª"
              className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-[#FF6B35] transition-all min-h-[44px]"
            />
          </div>
          <div className="flex flex-col items-center justify-center flex-shrink-0 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-100 min-h-[44px]">
             <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase tracking-wide transition-colors ${filterType === 'veg' ? 'text-green-600' : 'text-gray-400'}`}>Veg</span>
                <div 
                   className="relative w-[44px] h-[22px] bg-gray-200 rounded-full cursor-pointer transition-colors shadow-inner"
                   style={{ background: filterType === 'veg' ? '#22C55E' : filterType === 'nonveg' ? '#EF4444' : '#E5E7EB' }}
                   onClick={() => {
                      if (filterType === 'all') setFilterType('veg');
                      else if (filterType === 'veg') setFilterType('nonveg');
                      else setFilterType('all');
                   }}
                >
                   <div 
                     className="absolute top-[2px] left-[2px] w-[18px] h-[18px] bg-white rounded-full shadow border border-gray-200 transition-transform duration-300"
                     style={{
                        transform: filterType === 'veg' ? 'translateX(0px)' : filterType === 'all' ? 'translateX(11px)' : 'translateX(22px)'
                     }}
                   />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wide transition-colors ${filterType === 'nonveg' ? 'text-red-500' : 'text-gray-400'}`}>Non-Veg</span>
             </div>
          </div>
        </div>

        {!loading && categories.length > 0 ? (
          <div className="px-4 py-3 flex gap-2 border-b border-gray-100 overflow-x-auto no-scrollbar whitespace-nowrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={`px-3 py-2 rounded-full text-xs font-semibold transition-all min-h-[44px] ${
                  activeCategory === cat
                    ? 'bg-[#FF6B35] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat} {cat === 'All' ? '' : `(${categoryCounts[cat] || 0})`}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4 space-y-8">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-5 w-40 rounded" />
              {Array.from({ length: 3 }).map((__, j) => (
                <SkeletonCard key={j} variant="menu-item" />
              ))}
            </div>
          ))
        ) : Object.keys(grouped).length === 0 ? (
          <div className="pt-8">
            <EmptyState
              icon="≡ƒì╜∩╕Å"
              title="Menu coming soon ΓÇö check back shortly."
              description="The menu is being updated by the restaurant."
            />
          </div>
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} ref={(el) => (categoryRefs.current[cat] = el)}>
              <h2 className="text-base font-bold text-[#1A1A2E] mb-3 flex items-center gap-2">
                <span>{cat}</span>
                <span className="text-xs font-normal text-gray-400">({catItems.length})</span>
              </h2>
              <div className="space-y-3">
                {catItems.map((item) => {
                  const qty = getQuantity(item.id);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-[12px] border border-gray-100 shadow-sm flex gap-3 overflow-hidden hover:shadow-md transition-shadow animate-fade-in"
                    >
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className={item.is_veg ? 'veg-dot' : 'nonveg-dot'} />
                          {item.is_bestseller && (
                            <Badge variant="warning" size="xs">
                              Γ¡É Bestseller
                            </Badge>
                          )}
                        </div>

                        <h3 className="font-semibold text-[#1A1A2E] text-sm leading-tight">{item.name}</h3>
                        {item.description ? (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                        ) : null}

                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className={item.is_veg ? 'text-[#22C55E]' : 'text-[#DC2626]'} style={{ fontWeight: 'bold' }}>{formatIndianPrice(item.price)}</span>
                          {item.prep_time_minutes ? (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock size={10} />
                              {formatTime(item.prep_time_minutes)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="relative flex-shrink-0 w-28">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover min-h-[100px]" />
                        ) : (
                          <div className="w-full min-h-[100px] bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center text-3xl">
                            {item.is_veg ? '≡ƒÑù' : '≡ƒìù'}
                          </div>
                        )}

                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                          {qty === 0 ? (
                            <button
                              onClick={() => handleAdd(item)}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-[#FF6B35] text-[#FF6B35] rounded text-[9px] font-bold shadow-sm hover:bg-[#FF6B35] hover:text-white transition-all active:scale-95 min-h-[24px]"
                            >
                              <Plus size={10} /> ADD
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 bg-[#FF6B35] text-white rounded px-1.5 py-0.5 shadow-sm min-h-[24px]">
                              <button
                                onClick={() => updateQuantity(item.id, qty - 1)}
                                className="hover:bg-[#E55A24] rounded p-0.5 transition-colors"
                                aria-label="Decrease quantity"
                              >
                                <Minus size={9} />
                              </button>
                              <span className="text-[9px] font-bold min-w-[12px] text-center">{qty}</span>
                              <button
                                onClick={() => addItem(item)}
                                className="hover:bg-[#E55A24] rounded p-0.5 transition-colors"
                                aria-label="Increase quantity"
                              >
                                <Plus size={9} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-30 animate-bounce-in">
          <button
            onClick={() => setIsCartSheetOpen(true)}
            className="w-full min-h-[56px] flex items-center justify-between bg-[#1A1A2E] text-white rounded-2xl px-5 py-4 shadow-2xl hover:bg-[#16213E] active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-[#FF6B35] rounded-xl text-sm font-bold">
                {cartCount}
              </div>
              <span className="font-semibold text-sm">
                {cartCount} item{cartCount > 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold">{formatIndianPrice(cartTotal)}</span>
              <span className="text-white/60 text-sm">Proceed to Pay ΓåÆ</span>
            </div>
          </button>
        </div>
      )}

      <BottomSheet
        isOpen={isCartSheetOpen}
        onClose={() => setIsCartSheetOpen(false)}
        title="Your Cart"
        maxHeight="85vh"
      >
        <div className="p-4 space-y-4">
          {items.length === 0 ? (
            <EmptyState icon="≡ƒ¢Æ" title="Cart is empty" description="Add items from menu to continue." />
          ) : (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                {items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div className="h-px bg-gray-100 mx-4" />}
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1A1A2E] truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.quantity} x {formatIndianPrice(item.price)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-[#FF6B35] min-h-[44px] flex items-center">
                        {formatIndianPrice(item.quantity * item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">{formatIndianPrice(cartTotal)}</span>
                </div>
                <div className="h-px bg-gray-100 my-3" />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1A1A2E]">Final Total</span>
                  <span className="font-bold text-[#FF6B35] text-lg">{formatIndianPrice(cartTotal)}</span>
                </div>
              </div>

              <Button
                variant="primary"
                fullWidth
                size="lg"
                onClick={() => {
                  setIsCartSheetOpen(false);
                  navigate('/checkout');
                }}
                className="min-h-[56px] shadow-lg shadow-orange-500/20"
              >
                Proceed to Pay
              </Button>
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Install QATO"
        maxHeight="60vh"
        showHandle={false}
      >
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">Add QATO to your home screen for faster ordering.</p>
          <Button variant="primary" fullWidth onClick={triggerInstall} className="min-h-[44px]">
            Add to Home Screen
          </Button>
          <Button variant="outline" fullWidth onClick={() => setPromptOpen(false)} className="min-h-[44px]">
            Not now
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/*
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Leaf, Minus, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { getSupabaseClient } from '../../lib/supabaseClient';
import { useCart } from '../../context/CartContext';
import { formatIndianPrice, formatTime } from '../../utils/helpers';

import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import Button from '../../components/ui/Button';

import { useSeoForCustomer } from '../../hooks/useSeoForCustomer';
import { useAddToHomeScreenPrompt } from '../../hooks/useAddToHomeScreenPrompt';
import { useSupabaseChannelReconnect } from '../../hooks/useSupabaseChannelReconnect';

/*
export default function MenuPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { items, addItem, updateQuantity, getItemCount, getTotal, initializeCart } = useCart();

  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]); // category names
  const [menuItems, setMenuItems] = useState([]); // normalized items

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);

  const categoryRefs = useRef({});
  const headerRef = useRef(null);
  const fetchMenuDataRef = useRef(null);

  const { promptOpen, setPromptOpen, trigger: triggerInstall } = useAddToHomeScreenPrompt({
    showDelayMs: 30000,
  });

  const isReconnecting = useSupabaseChannelReconnect({
    enabled: Boolean(supabase && restaurant?.id),
    buildChannel: (sb) =>
      sb
        .channel(`customer-menu:${restaurant?.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'menu_items',
            filter: `restaurant_id=eq.${restaurant?.id}`,
          },
          () => fetchMenuDataRef.current?.()
        ),
  });

  useSeoForCustomer({
    title: restaurant?.name ? `${restaurant.name} ΓÇö Order Online | QATO` : 'QATO ΓÇö Order Online',
    description: restaurant?.name
      ? `Order online from ${restaurant.name} on QATO. Fast pickup and transparent wait times.`
      : undefined,
    ogImageUrl: restaurant?.logo_url || undefined,
  });

  const fetchMenuData = async () => {
    if (!supabase) {
      setError('Supabase is not configured. Please try again.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { data: restaurantData, error: restErr } = await supabase
        .from('restaurants')
        .select(
          'id,name,slug,logo_url,address,phone,cuisine_type,opening_time,closing_time,is_accepting_orders,default_prep_time'
        )
        .eq('slug', slug)
        .single();

      if (restErr || !restaurantData) throw new Error('Restaurant not found');

      const restaurantId = restaurantData.id;

      const [catRes, itemRes] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('id,name,sort_order')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('menu_items')
          .select(
            'id,category_id,name,description,price,is_veg,photo_url,image_url,prep_time_minutes,is_available,is_bestseller,sort_order'
          )
          .eq('restaurant_id', restaurantId)
          .eq('is_available', true)
          .order('sort_order', { ascending: true }),
      ]);

      if (catRes.error) throw catRes.error;
      if (itemRes.error) throw itemRes.error;

      const categoryRows = catRes.data || [];
      const categoryNames = categoryRows.map((c) => c.name);
      const categoryById = new Map(categoryRows.map((c) => [c.id, c.name]));

      const normalizedItems = (itemRes.data || []).map((item) => ({
        ...item,
        category: categoryById.get(item.category_id) || '',
        image_url: item.photo_url || item.image_url || null,
      }));

      setRestaurant(restaurantData);
      setCategories(categoryNames);
      setMenuItems(normalizedItems);
      initializeCart(restaurantId, slug, null, restaurantData.name || '');
      setActiveCategory(categoryNames[0] || '');
    } catch (e) {
      setError(e?.message || 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuDataRef.current = fetchMenuData;
    fetchMenuData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (vegOnly && !item.is_veg) return false;
      if (
        search &&
        !item.name.toLowerCase().includes(search.toLowerCase()) &&
        !item.description?.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [menuItems, vegOnly, search]);

  const grouped = useMemo(() => {
    const byCat = categories.reduce((acc, cat) => {
      const catItems = filteredItems.filter((i) => i.category === cat);
      if (catItems.length > 0) acc[cat] = catItems;
      return acc;
    }, {});

    const uncategorized = filteredItems.filter((i) => !i.category || !categories.includes(i.category));
    if (uncategorized.length > 0) byCat.Other = uncategorized;
    return byCat;
  }, [categories, filteredItems]);

  const getQuantity = (itemId) => items.find((i) => i.id === itemId)?.quantity || 0;
  const cartCount = getItemCount();
  const cartTotal = getTotal();

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    const el = categoryRefs.current[cat];
    if (!el || !headerRef.current) return;
    const offset = headerRef.current.offsetHeight || 140;
    const top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const handleAdd = (item) => {
    addItem(item);
    toast.success(`${item.name} added!`, {
      duration: 1500,
      position: 'bottom-center',
      style: { background: '#1A1A2E', color: 'white', borderRadius: '12px', fontSize: '14px' },
    });
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <EmptyState
          icon="≡ƒì╜∩╕Å"
          title={error === 'Restaurant not found' ? 'Restaurant not found' : 'Could not load menu'}
          description="Please check your connection and try again."
          actionLabel="Retry"
          onAction={fetchMenuData}
          compact
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      <div ref={headerRef} className="sticky top-0 z-20 bg-white shadow-sm">
        {!loading && restaurant && (
          <div className="bg-gradient-to-r from-[#1A1A2E] to-[#16213E] px-4 pt-5 pb-4">
            <h1 className="text-xl font-bold text-white">{restaurant.name}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-white/60 text-xs flex-wrap">
              {restaurant.cuisine_type && <span>{restaurant.cuisine_type}</span>}
              {restaurant.cuisine_type && restaurant.opening_time && <span>┬╖</span>}
              {restaurant.opening_time && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {restaurant.opening_time} ΓÇô {restaurant.closing_time}
                </span>
              )}
            </div>
          </div>
        )}

        {isReconnecting ? (
          <div className="px-4 py-2">
            <p className="text-xs text-[#FF6B35] font-semibold">ReconnectingΓÇª</p>
          </div>
        ) : null}

        <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishesΓÇª"
              className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-[#FF6B35] transition-all min-h-[44px]"
            />
          </div>
          <button
            onClick={() => setVegOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all flex-shrink-0 min-h-[44px] ${
              vegOnly ? 'bg-green-50 border-green-400 text-green-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            <Leaf size={14} className={vegOnly ? 'text-green-600' : undefined} />
            Veg
          </button>
        </div>

        {!loading && Object.keys(grouped).length > 0 ? (
          <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-gray-100">
            {Object.keys(grouped).map((cat) => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={`px-3 py-2 rounded-full text-xs font-semibold transition-all min-h-[44px] ${
                  activeCategory === cat
                    ? 'bg-[#FF6B35] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat} ({grouped[cat].length})
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4 space-y-8">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-5 w-40 rounded" />
              {Array.from({ length: 3 }).map((__, j) => (
                <SkeletonCard key={j} variant="menu-item" />
              ))}
            </div>
          ))
        ) : Object.keys(grouped).length === 0 ? (
          <div className="pt-8">
            <EmptyState
              icon="≡ƒì╜∩╕Å"
              title="Menu coming soon ΓÇö check back shortly."
              description="The menu is being updated by the restaurant."
            />
          </div>
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} ref={(el) => (categoryRefs.current[cat] = el)}>
              <h2 className="text-base font-bold text-[#1A1A2E] mb-3 flex items-center gap-2">
                <span>{cat}</span>
                <span className="text-xs font-normal text-gray-400">({catItems.length})</span>
              </h2>
              <div className="space-y-3">
                {catItems.map((item) => {
                  const qty = getQuantity(item.id);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-[12px] border border-gray-100 shadow-sm flex gap-3 overflow-hidden hover:shadow-md transition-shadow animate-fade-in"
                    >
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className={item.is_veg ? 'veg-dot' : 'nonveg-dot'} />
                          {item.is_bestseller && (
                            <Badge variant="warning" size="xs">
                              Γ¡É Bestseller
                            </Badge>
                          )}
                        </div>

                        <h3 className="font-semibold text-[#1A1A2E] text-sm leading-tight">{item.name}</h3>
                        {item.description ? (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                        ) : null}

                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="font-bold text-[#FF6B35]">{formatIndianPrice(item.price)}</span>
                          {item.prep_time_minutes ? (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock size={10} />
                              {formatTime(item.prep_time_minutes)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="relative flex-shrink-0 w-28">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover min-h-[100px]" />
                        ) : (
                          <div className="w-full min-h-[100px] bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center text-3xl">
                            {item.is_veg ? '≡ƒÑù' : '≡ƒìù'}
                          </div>
                        )}

                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                          {qty === 0 ? (
                            <button
                              onClick={() => handleAdd(item)}
                              className="flex items-center gap-1 px-3 py-2 bg-white border-2 border-[#FF6B35] text-[#FF6B35] rounded-xl text-sm font-bold shadow-md hover:bg-[#FF6B35] hover:text-white transition-all active:scale-95 min-h-[44px]"
                            >
                              <Plus size={14} /> ADD
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 bg-[#FF6B35] text-white rounded-xl px-2 py-1.5 shadow-md min-h-[44px]">
                              <button
                                onClick={() => updateQuantity(item.id, qty - 1)}
                                className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors"
                                aria-label="Decrease quantity"
                              >
                                <Minus size={13} />
                              </button>
                              <span className="text-sm font-bold min-w-[20px] text-center">{qty}</span>
                              <button
                                onClick={() => addItem(item)}
                                className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors"
                                aria-label="Increase quantity"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-30 animate-bounce-in">
          <button
            onClick={() => setIsCartSheetOpen(true)}
            className="w-full min-h-[56px] flex items-center justify-between bg-[#1A1A2E] text-white rounded-2xl px-5 py-4 shadow-2xl hover:bg-[#16213E] active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-[#FF6B35] rounded-xl text-sm font-bold">
                {cartCount}
              </div>
              <span className="font-semibold text-sm">
                {cartCount} item{cartCount > 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold">{formatIndianPrice(cartTotal)}</span>
              <span className="text-white/60 text-sm">Proceed to Pay ΓåÆ</span>
            </div>
          </button>
        </div>
      )}

      <BottomSheet
        isOpen={isCartSheetOpen}
        onClose={() => setIsCartSheetOpen(false)}
        title="Your Cart"
        maxHeight="85vh"
      >
        <div className="p-4 space-y-4">
          {items.length === 0 ? (
            <EmptyState icon="≡ƒ¢Æ" title="Cart is empty" description="Add items from menu to continue." />
          ) : (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                {items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div className="h-px bg-gray-100 mx-4" />}
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1A1A2E] truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.quantity} x {formatIndianPrice(item.price)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-[#FF6B35] min-h-[44px] flex items-center">
                        {formatIndianPrice(item.quantity * item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">{formatIndianPrice(cartTotal)}</span>
                </div>
                <div className="h-px bg-gray-100 my-3" />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1A1A2E]">Final Total</span>
                  <span className="font-bold text-[#FF6B35] text-lg">{formatIndianPrice(cartTotal)}</span>
                </div>
              </div>

              <Button
                variant="primary"
                fullWidth
                size="lg"
                onClick={() => {
                  setIsCartSheetOpen(false);
                  navigate('/checkout');
                }}
                className="min-h-[56px] shadow-lg shadow-orange-500/20"
              >
                Proceed to Pay
              </Button>
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Install QATO"
        maxHeight="60vh"
        showHandle={false}
      >
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">Add QATO to your home screen for faster ordering.</p>
          <Button variant="primary" fullWidth onClick={triggerInstall} className="min-h-[44px]">
            Add to Home Screen
          </Button>
          <Button variant="outline" fullWidth onClick={() => setPromptOpen(false)} className="min-h-[44px]">
            Not now
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/*
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Leaf, Minus, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { getSupabaseClient } from '../../lib/supabaseClient';
import { useCart } from '../../context/CartContext';
import { formatIndianPrice, formatTime } from '../../utils/helpers';

import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import Button from '../../components/ui/Button';

import { useSeoForCustomer } from '../../hooks/useSeoForCustomer';
import { useAddToHomeScreenPrompt } from '../../hooks/useAddToHomeScreenPrompt';
import { useSupabaseChannelReconnect } from '../../hooks/useSupabaseChannelReconnect';

export default function MenuPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { items, addItem, updateQuantity, getItemCount, getTotal, initializeCart } = useCart();

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]); // category names
  const [menuItems, setMenuItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);

  const categoryRefs = useRef({});
  const headerRef = useRef(null);
  const fetchMenuDataRef = useRef(null);
  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const { promptOpen, setPromptOpen, trigger: triggerInstall } = useAddToHomeScreenPrompt({
    showDelayMs: 30000,
  });

  const isReconnecting = useSupabaseChannelReconnect({
    enabled: Boolean(restaurant?.id && supabase),
    buildChannel: (sb) =>
      sb
        .channel(`customer-menu:${restaurant?.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'menu_items',
            filter: `restaurant_id=eq.${restaurant?.id}`,
          },
          () => fetchMenuDataRef.current?.()
        ),
  });

  const filtered = useMemo(() => {
    return menuItems.filter((item) => {
      if (!item.is_available) return false;
      if (vegOnly && !item.is_veg) return false;
      if (
        search &&
        !item.name.toLowerCase().includes(search.toLowerCase()) &&
        !item.description?.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [menuItems, search, vegOnly]);

  const grouped = useMemo(() => {
    const byCat = categories.reduce((acc, cat) => {
      const catItems = filtered.filter((i) => i.category === cat);
      if (catItems.length > 0) acc[cat] = catItems;
      return acc;
    }, {});

    const uncategorized = filtered.filter((i) => !i.category || !categories.includes(i.category));
    if (uncategorized.length > 0) byCat.Other = uncategorized;
    return byCat;
  }, [categories, filtered]);

  const cartCount = getItemCount();
  const cartTotal = getTotal();

  useSeoForCustomer({
    title: restaurant?.name ? `${restaurant.name} ΓÇö Order Online | QATO` : 'QATO ΓÇö Order Online',
    description: restaurant?.name
      ? `Order online from ${restaurant.name} on QATO. Fast pickup and transparent wait times.`
      : undefined,
    ogImageUrl: restaurant?.logo_url || undefined,
  });

  const fetchMenuData = async () => {
    if (!supabase) {
      setError('Supabase is not configured. Please try again.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const {
        data: restaurantData,
        error: restErr,
      } = await supabase
        .from('restaurants')
        .select(
          'id,name,slug,logo_url,address,phone,cuisine_type,opening_time,closing_time,is_accepting_orders,default_prep_time'
        )
        .eq('slug', slug)
        .single();

      if (restErr || !restaurantData) throw new Error('Restaurant not found');

      const restaurantId = restaurantData.id;

      const [catRes, itemRes] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('id,name,sort_order')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('menu_items')
          .select('id,category_id,name,description,price,is_veg,photo_url,image_url,prep_time_minutes,is_available,is_bestseller,sort_order')
          .eq('restaurant_id', restaurantId)
          .eq('is_available', true)
          .order('sort_order', { ascending: true }),
      ]);

      if (catRes.error) throw catRes.error;
      if (itemRes.error) throw itemRes.error;

      const categoryRows = catRes.data || [];
      const categoryNames = categoryRows.map((c) => c.name);
      const categoryById = new Map(categoryRows.map((c) => [c.id, c.name]));

      const normalizedItems = (itemRes.data || []).map((item) => ({
        ...item,
        category: categoryById.get(item.category_id) || '',
        image_url: item.photo_url || item.image_url || null,
      }));

      setRestaurant(restaurantData);
      setCategories(categoryNames);
      setMenuItems(normalizedItems);

      initializeCart(restaurantId, slug, null, restaurantData.name || '');
      setActiveCategory(categoryNames[0] || '');
    } catch (e) {
      setError(e?.message || 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuDataRef.current = fetchMenuData;
    fetchMenuData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const getQuantity = (itemId) => items.find((i) => i.id === itemId)?.quantity || 0;

  const handleAdd = (item) => {
    addItem(item);
    toast.success(`${item.name} added!`, {
      duration: 1500,
      position: 'bottom-center',
      style: { background: '#1A1A2E', color: 'white', borderRadius: '12px', fontSize: '14px' },
    });
  };

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    const el = categoryRefs.current[cat];
    if (el && headerRef.current) {
      const offset = headerRef.current?.offsetHeight || 140;
      const top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <EmptyState
          icon="≡ƒì╜∩╕Å"
          title={error === 'Restaurant not found' ? 'Restaurant not found' : 'Could not load menu'}
          description="Please check your connection and try again."
          actionLabel="Retry"
          onAction={fetchMenuData}
          compact
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      <div ref={headerRef} className="sticky top-0 z-20 bg-white shadow-sm">
        {!loading && restaurant && (
          <div className="bg-gradient-to-r from-[#1A1A2E] to-[#16213E] px-4 pt-5 pb-4">
            <h1 className="text-xl font-bold text-white">{restaurant.name}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-white/60 text-xs flex-wrap">
              {restaurant.cuisine_type && <span>{restaurant.cuisine_type}</span>}
              {restaurant.cuisine_type && restaurant.opening_time && <span>┬╖</span>}
              {restaurant.opening_time && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {restaurant.opening_time} ΓÇô {restaurant.closing_time}
                </span>
              )}
            </div>
          </div>
        )}

        {isReconnecting ? (
          <div className="px-4 py-2">
            <p className="text-xs text-[#FF6B35] font-semibold">ReconnectingΓÇª</p>
          </div>
        ) : null}

        <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishesΓÇª"
              className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-[#FF6B35] transition-all min-h-[44px]"
            />
          </div>
          <button
            onClick={() => setVegOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all flex-shrink-0 min-h-[44px] ${
              vegOnly ? 'bg-green-50 border-green-400 text-green-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            <Leaf size={14} className={vegOnly ? 'text-green-600' : undefined} />
            Veg
          </button>
        </div>

        {!loading && Object.keys(grouped).length > 0 ? (
          <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-gray-100">
            {Object.keys(grouped).map((cat) => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={`px-3 py-2 rounded-full text-xs font-semibold transition-all min-h-[44px] ${
                  activeCategory === cat
                    ? 'bg-[#FF6B35] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat} ({grouped[cat].length})
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4 space-y-8">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-5 w-40 rounded" />
              {Array.from({ length: 3 }).map((__, j) => (
                <SkeletonCard key={j} variant="menu-item" />
              ))}
            </div>
          ))
        ) : Object.keys(grouped).length === 0 ? (
          <div className="pt-8">
            <EmptyState
              icon="≡ƒì╜∩╕Å"
              title="Menu coming soon ΓÇö check back shortly."
              description="The menu is being updated by the restaurant."
            />
          </div>
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} ref={(el) => (categoryRefs.current[cat] = el)}>
              <h2 className="text-base font-bold text-[#1A1A2E] mb-3 flex items-center gap-2">
                <span>{cat}</span>
                <span className="text-xs font-normal text-gray-400">({catItems.length})</span>
              </h2>
              <div className="space-y-3">
                {catItems.map((item) => {
                  const qty = getQuantity(item.id);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-[12px] border border-gray-100 shadow-sm flex gap-3 overflow-hidden hover:shadow-md transition-shadow animate-fade-in"
                    >
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className={item.is_veg ? 'veg-dot' : 'nonveg-dot'} />
                          {item.is_bestseller && (
                            <Badge variant="warning" size="xs">
                              Γ¡É Bestseller
                            </Badge>
                          )}
                        </div>

                        <h3 className="font-semibold text-[#1A1A2E] text-sm leading-tight">{item.name}</h3>
                        {item.description ? (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                        ) : null}

                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="font-bold text-[#FF6B35]">{formatIndianPrice(item.price)}</span>
                          {item.prep_time_minutes ? (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock size={10} />
                              {formatTime(item.prep_time_minutes)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="relative flex-shrink-0 w-28">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover min-h-[100px]" />
                        ) : (
                          <div className="w-full min-h-[100px] bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center text-3xl">
                            {item.is_veg ? '≡ƒÑù' : '≡ƒìù'}
                          </div>
                        )}

                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                          {qty === 0 ? (
                            <button
                              onClick={() => handleAdd(item)}
                              className="flex items-center gap-1 px-3 py-2 bg-white border-2 border-[#FF6B35] text-[#FF6B35] rounded-xl text-sm font-bold shadow-md hover:bg-[#FF6B35] hover:text-white transition-all active:scale-95 min-h-[44px]"
                            >
                              <Plus size={14} /> ADD
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 bg-[#FF6B35] text-white rounded-xl px-2 py-1.5 shadow-md min-h-[44px]">
                              <button
                                onClick={() => updateQuantity(item.id, qty - 1)}
                                className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors"
                                aria-label="Decrease quantity"
                              >
                                <Minus size={13} />
                              </button>
                              <span className="text-sm font-bold min-w-[20px] text-center">{qty}</span>
                              <button
                                onClick={() => addItem(item)}
                                className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors"
                                aria-label="Increase quantity"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-30 animate-bounce-in">
          <button
            onClick={() => setIsCartSheetOpen(true)}
            className="w-full min-h-[56px] flex items-center justify-between bg-[#1A1A2E] text-white rounded-2xl px-5 py-4 shadow-2xl hover:bg-[#16213E] active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-[#FF6B35] rounded-xl text-sm font-bold">
                {cartCount}
              </div>
              <span className="font-semibold text-sm">
                {cartCount} item{cartCount > 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold">{formatIndianPrice(cartTotal)}</span>
              <span className="text-white/60 text-sm">Proceed to Pay ΓåÆ</span>
            </div>
          </button>
        </div>
      )}

      <BottomSheet
        isOpen={isCartSheetOpen}
        onClose={() => setIsCartSheetOpen(false)}
        title="Your Cart"
        maxHeight="85vh"
      >
        <div className="p-4 space-y-4">
          {items.length === 0 ? (
            <EmptyState icon="≡ƒ¢Æ" title="Cart is empty" description="Add items from menu to continue." />
          ) : (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                {items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div className="h-px bg-gray-100 mx-4" />}
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1A1A2E] truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.quantity} x {formatIndianPrice(item.price)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-[#FF6B35] min-h-[44px] flex items-center">
                        {formatIndianPrice(item.quantity * item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">{formatIndianPrice(cartTotal)}</span>
                </div>
                <div className="h-px bg-gray-100 my-3" />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1A1A2E]">Final Total</span>
                  <span className="font-bold text-[#FF6B35] text-lg">{formatIndianPrice(cartTotal)}</span>
                </div>
              </div>

              <Button
                variant="primary"
                fullWidth
                size="lg"
                onClick={() => {
                  setIsCartSheetOpen(false);
                  navigate('/checkout');
                }}
                className="min-h-[56px] shadow-lg shadow-orange-500/20"
              >
                Proceed to Pay
              </Button>
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Install QATO"
        maxHeight="60vh"
        showHandle={false}
      >
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">Add QATO to your home screen for faster ordering.</p>
          <Button variant="primary" fullWidth onClick={triggerInstall} className="min-h-[44px]">
            Add to Home Screen
          </Button>
          <Button
            variant="outline"
            fullWidth
            onClick={() => setPromptOpen(false)}
            className="min-h-[44px]"
          >
            Not now
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/*
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Leaf, Minus, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import Button from '../../components/ui/Button';

import { useCart } from '../../context/CartContext';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { formatIndianPrice, formatTime } from '../../utils/helpers';
import { useSeoForCustomer } from '../../hooks/useSeoForCustomer';
import { useAddToHomeScreenPrompt } from '../../hooks/useAddToHomeScreenPrompt';
import { useSupabaseChannelReconnect } from '../../hooks/useSupabaseChannelReconnect';

export default function MenuPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { items, addItem, updateQuantity, getItemCount, getTotal, initializeCart } = useCart();

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]); // category names
  const [menuItems, setMenuItems] = useState([]); // normalized items

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);

  const categoryRefs = useRef({});
  const headerRef = useRef(null);
  const fetchMenuDataRef = useRef(null);

  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const { promptOpen, setPromptOpen, trigger: triggerInstall } = useAddToHomeScreenPrompt({
    showDelayMs: 30000,
  });

  const isReconnecting = useSupabaseChannelReconnect({
    enabled: Boolean(restaurant?.id && supabase),
    buildChannel: (sb) => {
      return sb
        .channel(`customer-menu:${restaurant?.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'menu_items',
            filter: `restaurant_id=eq.${restaurant?.id}`,
          },
          () => {
            fetchMenuDataRef.current?.();
          }
        );
    },
  });

  useSeoForCustomer({
    title: restaurant?.name ? `${restaurant.name} ΓÇö Order Online | QATO` : 'QATO ΓÇö Order Online',
    description: restaurant?.name
      ? `Order online from ${restaurant.name} on QATO. Fast pickup and transparent wait times.`
      : undefined,
    ogImageUrl: restaurant?.logo_url || undefined,
  });

  const fetchMenuData = async () => {
    if (!supabase) {
      setError('Supabase is not configured. Please try again.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { data: restaurantData, error: restErr } = await supabase
        .from('restaurants')
        .select(
          'id,name,slug,logo_url,address,phone,cuisine_type,opening_time,closing_time,is_accepting_orders,default_prep_time'
        )
        .eq('slug', slug)
        .single();

      if (restErr || !restaurantData) throw new Error('Restaurant not found');

      const restaurantId = restaurantData.id;

      const [catRes, itemRes] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('id,name,sort_order')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('menu_items')
          .select('id,category_id,name,description,price,is_veg,photo_url,image_url,prep_time_minutes,is_available,is_bestseller,sort_order')
          .eq('restaurant_id', restaurantId)
          .eq('is_available', true)
          .order('sort_order', { ascending: true }),
      ]);

      if (catRes.error) throw catRes.error;
      if (itemRes.error) throw itemRes.error;

      const categoryRows = catRes.data || [];
      const categoryNames = categoryRows.map((c) => c.name);
      const categoryById = new Map(categoryRows.map((c) => [c.id, c.name]));

      const normalizedItems = (itemRes.data || []).map((item) => ({
        ...item,
        category: categoryById.get(item.category_id) || '',
        image_url: item.photo_url || item.image_url || null,
      }));

      setRestaurant(restaurantData);
      setCategories(categoryNames);
      setMenuItems(normalizedItems);

      initializeCart(restaurantId, slug, null, restaurantData.name || '');
      setActiveCategory(categoryNames[0] || '');
    } catch (e) {
      setError(e?.message || 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuDataRef.current = fetchMenuData;
    fetchMenuData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, supabase]);

  const filtered = useMemo(() => {
    return menuItems.filter((item) => {
      if (!item.is_available) return false;
      if (vegOnly && !item.is_veg) return false;
      if (
        search &&
        !item.name.toLowerCase().includes(search.toLowerCase()) &&
        !item.description?.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [menuItems, vegOnly, search]);

  const grouped = useMemo(() => {
    const byCat = categories.reduce((acc, cat) => {
      const catItems = filtered.filter((i) => i.category === cat);
      if (catItems.length > 0) acc[cat] = catItems;
      return acc;
    }, {});

    const uncategorized = filtered.filter((i) => !i.category || !categories.includes(i.category));
    if (uncategorized.length > 0) byCat.Other = uncategorized;
    return byCat;
  }, [categories, filtered]);

  const getQuantity = (itemId) => items.find((i) => i.id === itemId)?.quantity || 0;
  const cartCount = getItemCount();
  const cartTotal = getTotal();

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    const el = categoryRefs.current[cat];
    if (el && headerRef.current) {
      const offset = headerRef.current?.offsetHeight || 140;
      const top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const handleAdd = (item) => {
    addItem(item);
    toast.success(`${item.name} added!`, {
      duration: 1500,
      position: 'bottom-center',
      style: { background: '#1A1A2E', color: 'white', borderRadius: '12px', fontSize: '14px' },
    });
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <EmptyState
          icon="≡ƒì╜∩╕Å"
          title={error === 'Restaurant not found' ? 'Restaurant not found' : 'Could not load menu'}
          description="Please check your connection and try again."
          actionLabel="Retry"
          onAction={fetchMenuData}
          compact
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      <div ref={headerRef} className="sticky top-0 z-20 bg-white shadow-sm">
        {!loading && restaurant && (
          <div className="bg-gradient-to-r from-[#1A1A2E] to-[#16213E] px-4 pt-5 pb-4">
            <h1 className="text-xl font-bold text-white">{restaurant.name}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-white/60 text-xs flex-wrap">
              {restaurant.cuisine_type && <span>{restaurant.cuisine_type}</span>}
              {restaurant.cuisine_type && restaurant.opening_time && <span>┬╖</span>}
              {restaurant.opening_time && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {restaurant.opening_time} ΓÇô {restaurant.closing_time}
                </span>
              )}
            </div>
          </div>
        )}

        {isReconnecting ? (
          <div className="px-4 py-2">
            <p className="text-xs text-[#FF6B35] font-semibold">ReconnectingΓÇª</p>
          </div>
        ) : null}

        <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishesΓÇª"
              className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-[#FF6B35] transition-all min-h-[44px]"
            />
          </div>
          <button
            onClick={() => setVegOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all flex-shrink-0 min-h-[44px] ${
              vegOnly ? 'bg-green-50 border-green-400 text-green-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            <Leaf size={14} className={vegOnly ? 'text-green-600' : undefined} />
            Veg
          </button>
        </div>

        {!loading && Object.keys(grouped).length > 0 ? (
          <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-gray-100">
            {Object.keys(grouped).map((cat) => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={`px-3 py-2 rounded-full text-xs font-semibold transition-all min-h-[44px] ${
                  activeCategory === cat
                    ? 'bg-[#FF6B35] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat} ({grouped[cat].length})
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4 space-y-8">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-5 w-40 rounded" />
              {Array.from({ length: 3 }).map((__, j) => (
                <SkeletonCard key={j} variant="menu-item" />
              ))}
            </div>
          ))
        ) : Object.keys(grouped).length === 0 ? (
          <div className="pt-8">
            <EmptyState
              icon="≡ƒì╜∩╕Å"
              title="Menu coming soon ΓÇö check back shortly."
              description="The menu is being updated by the restaurant."
            />
          </div>
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} ref={(el) => (categoryRefs.current[cat] = el)}>
              <h2 className="text-base font-bold text-[#1A1A2E] mb-3 flex items-center gap-2">
                <span>{cat}</span>
                <span className="text-xs font-normal text-gray-400">({catItems.length})</span>
              </h2>
              <div className="space-y-3">
                {catItems.map((item) => {
                  const qty = getQuantity(item.id);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-[12px] border border-gray-100 shadow-sm flex gap-3 overflow-hidden hover:shadow-md transition-shadow animate-fade-in"
                    >
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className={item.is_veg ? 'veg-dot' : 'nonveg-dot'} />
                          {item.is_bestseller && (
                            <Badge variant="warning" size="xs">
                              Γ¡É Bestseller
                            </Badge>
                          )}
                        </div>

                        <h3 className="font-semibold text-[#1A1A2E] text-sm leading-tight">{item.name}</h3>
                        {item.description ? (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        ) : null}

                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="font-bold text-[#FF6B35]">{formatIndianPrice(item.price)}</span>
                          {item.prep_time_minutes ? (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock size={10} />
                              {formatTime(item.prep_time_minutes)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="relative flex-shrink-0 w-28">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover min-h-[100px]"
                          />
                        ) : (
                          <div className="w-full min-h-[100px] bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center text-3xl">
                            {item.is_veg ? '≡ƒÑù' : '≡ƒìù'}
                          </div>
                        )}

                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                          {qty === 0 ? (
                            <button
                              onClick={() => handleAdd(item)}
                              className="flex items-center gap-1 px-3 py-2 bg-white border-2 border-[#FF6B35] text-[#FF6B35] rounded-xl text-sm font-bold shadow-md hover:bg-[#FF6B35] hover:text-white transition-all active:scale-95 min-h-[44px]"
                            >
                              <Plus size={14} /> ADD
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 bg-[#FF6B35] text-white rounded-xl px-2 py-1.5 shadow-md min-h-[44px]">
                              <button
                                onClick={() => updateQuantity(item.id, qty - 1)}
                                className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors"
                                aria-label="Decrease quantity"
                              >
                                <Minus size={13} />
                              </button>
                              <span className="text-sm font-bold min-w-[20px] text-center">{qty}</span>
                              <button
                                onClick={() => handleAdd(item)}
                                className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors"
                                aria-label="Increase quantity"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-30 animate-bounce-in">
          <button
            onClick={() => setIsCartSheetOpen(true)}
            className="w-full min-h-[56px] flex items-center justify-between bg-[#1A1A2E] text-white rounded-2xl px-5 py-4 shadow-2xl hover:bg-[#16213E] active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-[#FF6B35] rounded-xl text-sm font-bold">
                {cartCount}
              </div>
              <span className="font-semibold text-sm">
                {cartCount} item{cartCount > 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold">{formatIndianPrice(cartTotal)}</span>
              <span className="text-white/60 text-sm">Proceed to Pay ΓåÆ</span>
            </div>
          </button>
        </div>
      )}

      <BottomSheet
        isOpen={isCartSheetOpen}
        onClose={() => setIsCartSheetOpen(false)}
        title="Your Cart"
        maxHeight="85vh"
      >
        <div className="p-4 space-y-4">
          {items.length === 0 ? (
            <EmptyState icon="≡ƒ¢Æ" title="Cart is empty" description="Add items from menu to continue." />
          ) : (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                {items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div className="h-px bg-gray-100 mx-4" />}
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1A1A2E] truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.quantity} x {formatIndianPrice(item.price)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-[#FF6B35] min-h-[44px] flex items-center">
                        {formatIndianPrice(item.quantity * item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">{formatIndianPrice(cartTotal)}</span>
                </div>
                <div className="h-px bg-gray-100 my-3" />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1A1A2E]">Final Total</span>
                  <span className="font-bold text-[#FF6B35] text-lg">{formatIndianPrice(cartTotal)}</span>
                </div>
              </div>

              <Button
                variant="primary"
                fullWidth
                size="lg"
                onClick={() => {
                  setIsCartSheetOpen(false);
                  navigate('/checkout');
                }}
                className="min-h-[56px] shadow-lg shadow-orange-500/20"
              >
                Proceed to Pay
              </Button>
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Install QATO"
        maxHeight="60vh"
        showHandle={false}
      >
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">Add QATO to your home screen for faster ordering.</p>
          <Button
            variant="primary"
            fullWidth
            onClick={triggerInstall}
            className="min-h-[44px]"
          >
            Add to Home Screen
          </Button>
          <Button
            variant="outline"
            fullWidth
            onClick={() => setPromptOpen(false)}
            className="min-h-[44px]"
          >
            Not now
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Leaf, Minus, Plus, Search } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import { useCart } from '../../context/CartContext';
import Button from '../../components/ui/Button';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { formatIndianPrice, formatTime } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { useSeoForCustomer } from '../../hooks/useSeoForCustomer';
import { useAddToHomeScreenPrompt } from '../../hooks/useAddToHomeScreenPrompt';
import { useSupabaseChannelReconnect } from '../../hooks/useSupabaseChannelReconnect';

export default function MenuPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const { items, addItem, updateQuantity, getItemCount, getTotal, initializeCart } = useCart();

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]); // array of category names
  const [menuItems, setMenuItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);

  const categoryRefs = useRef({});
  const headerRef = useRef(null);
  const fetchMenuDataRef = useRef(null);

  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const { promptOpen, setPromptOpen, trigger: triggerInstall } = useAddToHomeScreenPrompt({
    showDelayMs: 30000,
  });

  const isReconnecting = useSupabaseChannelReconnect({
    enabled: Boolean(restaurant?.id && supabase),
    buildChannel: (sb) => {
      // Re-fetch menu on any menu item change so sold-out/edits reflect instantly.
      return sb
        .channel(`customer-menu:${restaurant?.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'menu_items',
            filter: `restaurant_id=eq.${restaurant?.id}`,
          },
          () => fetchMenuDataRef.current?.()
        );
    },
  });

  const grouped = useMemo(() => {
    const filtered = menuItems.filter((item) => {
      if (!item.is_available) return false;
      if (vegOnly && !item.is_veg) return false;
      if (
        search &&
        !item.name.toLowerCase().includes(search.toLowerCase()) &&
        !item.description?.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });

    const byCat = categories.reduce((acc, cat) => {
      const catItems = filtered.filter((i) => i.category === cat);
      if (catItems.length > 0) acc[cat] = catItems;
      return acc;
    }, {});

    const uncategorized = filtered.filter((i) => !i.category || !categories.includes(i.category));
    if (uncategorized.length > 0) byCat.Other = uncategorized;
    return byCat;
  }, [categories, menuItems, search, vegOnly]);

  const cartCount = getItemCount();
  const cartTotal = getTotal();

  useSeoForCustomer({
    title: restaurant?.name ? `${restaurant.name} ΓÇö Order Online | QATO` : 'QATO ΓÇö Order Online',
    description: restaurant?.name
      ? `Order online from ${restaurant.name} on QATO. Fast pickup and transparent wait times.`
      : undefined,
    ogImageUrl: restaurant?.logo_url || undefined,
  });

  const fetchMenuData = async () => {
    if (!supabase) {
      setError('Supabase is not configured. Please try again.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');

      const { data: restaurantData, error: restErr } = await supabase
        .from('restaurants')
        .select(
          'id,name,slug,logo_url,address,phone,cuisine_type,opening_time,closing_time,is_accepting_orders,default_prep_time'
        )
        .eq('slug', slug)
        .single();

      if (restErr || !restaurantData) throw new Error('Restaurant not found');

      const restaurantId = restaurantData.id;
      const [catRes, itemRes] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('id,name,sort_order')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('menu_items')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('is_available', true)
          .order('sort_order', { ascending: true }),
      ]);

      if (catRes.error) throw catRes.error;
      if (itemRes.error) throw itemRes.error;

      const categoryRows = catRes.data || [];
      const categoryNames = categoryRows.map((c) => c.name);
      const categoryById = new Map(categoryRows.map((c) => [c.id, c.name]));

      const normalizedItems = (itemRes.data || []).map((item) => ({
        ...item,
        category: categoryById.get(item.category_id) || '',
        image_url: item.photo_url || item.image_url || null,
      }));

      setRestaurant(restaurantData);
      setCategories(categoryNames);
      setMenuItems(normalizedItems);

      initializeCart(restaurantId, slug, null, restaurantData.name || '');
      setActiveCategory(categoryNames[0] || '');
    } catch (e) {
      setError(e?.message || 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuDataRef.current = fetchMenuData;
    fetchMenuData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const getQuantity = (itemId) => items.find((i) => i.id === itemId)?.quantity || 0;

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    const el = categoryRefs.current[cat];
    if (el) {
      const offset = headerRef.current?.offsetHeight || 140;
      const top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <EmptyState
          icon="≡ƒì╜∩╕Å"
          title={error === 'Restaurant not found' ? 'Restaurant not found' : 'Could not load menu'}
          description="Please check your connection and try again."
          actionLabel="Retry"
          onAction={fetchMenuData}
          compact
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      <div ref={headerRef} className="sticky top-0 z-20 bg-white shadow-sm">
        {!loading && restaurant && (
          <div className="bg-gradient-to-r from-[#1A1A2E] to-[#16213E] px-4 pt-5 pb-4">
            <h1 className="text-xl font-bold text-white">{restaurant.name}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-white/60 text-xs">
              {restaurant.cuisine_type && <span>{restaurant.cuisine_type}</span>}
              {restaurant.cuisine_type && restaurant.opening_time && <span>┬╖</span>}
              {restaurant.opening_time && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {restaurant.opening_time} ΓÇô {restaurant.closing_time}
                </span>
              )}
            </div>
          </div>
        )}

        {isReconnecting ? (
          <div className="px-4 py-2">
            <p className="text-xs text-[#FF6B35] font-semibold">ReconnectingΓÇª</p>
          </div>
        ) : null}

        <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishesΓÇª"
              className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-[#FF6B35] transition-all min-h-[44px]"
            />
          </div>
          <button
            onClick={() => setVegOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all flex-shrink-0 min-h-[44px] ${
              vegOnly ? 'bg-green-50 border-green-400 text-green-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            <Leaf size={14} className={vegOnly ? 'text-green-600' : ''} />
            Veg
          </button>
        </div>

        {!loading && Object.keys(grouped).length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide">
            {Object.keys(grouped).map((cat) => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={`px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 min-h-[44px] ${
                  activeCategory === cat
                    ? 'bg-[#FF6B35] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat} ({grouped[cat].length})
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-8">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-5 w-32 rounded" />
              {Array.from({ length: 3 }).map((__, j) => <SkeletonCard key={j} variant="menu-item" />)}
            </div>
          ))
        ) : Object.keys(grouped).length === 0 ? (
          <div className="pt-8">
            <EmptyState
              icon="≡ƒì╜∩╕Å"
              title="Menu coming soon ΓÇö check back shortly."
              description="The menu is being updated by the restaurant."
            />
          </div>
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} ref={(el) => (categoryRefs.current[cat] = el)}>
              <h2 className="text-base font-bold text-[#1A1A2E] mb-3 flex items-center gap-2">
                <span>{cat}</span>
                <span className="text-xs font-normal text-gray-400">({catItems.length})</span>
              </h2>
              <div className="space-y-3">
                {catItems.map((item) => {
                  const qty = getQuantity(item.id);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-[12px] border border-gray-100 shadow-sm flex gap-3 overflow-hidden hover:shadow-md transition-shadow animate-fade-in"
                    >
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span
                            className={`w-3 h-3 rounded-sm border-2 flex-shrink-0 flex items-center justify-center ${
                              item.is_veg ? 'border-green-600' : 'border-red-600'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${item.is_veg ? 'bg-green-600' : 'bg-red-600'}`} />
                          </span>
                          {item.is_bestseller && <Badge variant="warning" size="xs">Γ¡É Bestseller</Badge>}
                        </div>
                        <h3 className="font-semibold text-[#1A1A2E] text-sm leading-tight">{item.name}</h3>
                        {item.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2.5">
                          <span className="font-bold text-[#FF6B35]">{formatIndianPrice(item.price)}</span>
                          {item.prep_time_minutes ? (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock size={10} />
                              {formatTime(item.prep_time_minutes)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="relative flex-shrink-0 w-28">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover min-h-[100px]" />
                        ) : (
                          <div className="w-full min-h-[100px] bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center text-3xl">
                            {item.is_veg ? '≡ƒÑù' : '≡ƒìù'}
                          </div>
                        )}

                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                          {qty === 0 ? (
                            <button
                              onClick={() => {
                                addItem(item);
                              }}
                              className="flex items-center gap-1 px-3 py-2 bg-white border-2 border-[#FF6B35] text-[#FF6B35] rounded-xl text-sm font-bold shadow-md hover:bg-[#FF6B35] hover:text-white transition-all active:scale-95 min-h-[44px]"
                            >
                              <Plus size={14} /> ADD
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 bg-[#FF6B35] text-white rounded-xl px-2 py-1.5 shadow-md min-h-[44px]">
                              <button
                                onClick={() => updateQuantity(item.id, qty - 1)}
                                className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors"
                              >
                                <Minus size={13} />
                              </button>
                              <span className="text-sm font-bold min-w-[20px] text-center">{qty}</span>
                              <button
                                onClick={() => addItem(item)}
                                className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-30 animate-bounce-in">
          <button
            onClick={() => setIsCartSheetOpen(true)}
            className="w-full min-h-[56px] flex items-center justify-between bg-[#1A1A2E] text-white rounded-2xl px-5 py-4 shadow-2xl hover:bg-[#16213E] active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-[#FF6B35] rounded-xl text-sm font-bold">
                {cartCount}
              </div>
              <span className="font-semibold text-sm">{cartCount} item{cartCount > 1 ? 's' : ''} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold">{formatIndianPrice(cartTotal)}</span>
              <span className="text-white/60 text-sm">Proceed to Pay ΓåÆ</span>
            </div>
          </button>
        </div>
      )}

      <BottomSheet
        isOpen={isCartSheetOpen}
        onClose={() => setIsCartSheetOpen(false)}
        title="Your Cart"
        maxHeight="85vh"
      >
        <div className="p-4 space-y-4">
          {items.length === 0 ? (
            <EmptyState icon="≡ƒ¢Æ" title="Cart is empty" description="Add items from menu to continue." />
          ) : (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                {items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div className="h-px bg-gray-100 mx-4" />}
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1A1A2E] truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.quantity} x {formatIndianPrice(item.price)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-[#FF6B35] min-h-[44px] flex items-center">
                        {formatIndianPrice(item.quantity * item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">{formatIndianPrice(cartTotal)}</span>
                </div>
                <div className="h-px bg-gray-100 my-3" />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1A1A2E]">Final Total</span>
                  <span className="font-bold text-[#FF6B35] text-lg">{formatIndianPrice(cartTotal)}</span>
                </div>
              </div>

              <Button
                variant="primary"
                fullWidth
                size="lg"
                onClick={() => {
                  setIsCartSheetOpen(false);
                  navigate('/checkout');
                }}
                className="min-h-[56px] shadow-lg shadow-orange-500/20"
              >
                Proceed to Pay
              </Button>
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Install QATO"
        maxHeight="60vh"
        showHandle={false}
      >
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">
            Add QATO to your home screen for faster ordering.
          </p>
          <Button variant="primary" fullWidth onClick={triggerInstall} className="min-h-[44px]">
            Add to Home Screen
          </Button>
          <Button variant="outline" fullWidth onClick={() => setPromptOpen(false)} className="min-h-[44px]">
            Not now
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/*
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, Plus, Minus, Leaf, Clock } from 'lucide-react';
import { getMenu } from '../../utils/api';
import { useCart } from '../../context/CartContext';
import { formatIndianPrice, formatTime } from '../../utils/helpers';
import SkeletonCard from '../../components/ui/SkeletonCard';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import toast from 'react-hot-toast';

export default function MenuPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { items, addItem, updateQuantity, getItemCount, getTotal, initializeCart } = useCart();
  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [error, setError] = useState('');
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);
  const categoryRefs = useRef({});
  const headerRef = useRef(null);

  useEffect(() => {
    fetchMenuData();
  }, [slug]);

  const fetchMenuData = async () => {
    try {
      const { data } = await getMenu(slug);
      setRestaurant(data.restaurant);
      setCategories(data.categories || []);
      setMenuItems(data.items || []);
      initializeCart(data.restaurant?.id, slug, null, data.restaurant?.name || '');
      if (data.categories?.length > 0) setActiveCategory(data.categories[0]);
    } catch (err) {
      setError(err.response?.status === 404 ? 'Restaurant not found' : 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  const getQuantity = (itemId) => {
    const found = items.find((i) => i.id === itemId);
    return found ? found.quantity : 0;
  };

  const handleAdd = (item) => {
    addItem(item);
    toast.success(`${item.name} added!`, { duration: 1500, position: 'bottom-center',
      style: { background: '#1A1A2E', color: 'white', borderRadius: '12px', fontSize: '14px' } });
  };

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    const el = categoryRefs.current[cat];
    if (el) {
      const offset = headerRef.current?.offsetHeight || 140;
      const top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const filtered = menuItems.filter((item) => {
    if (!item.is_available) return false;
    if (vegOnly && !item.is_veg) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) &&
        !item.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = categories.reduce((acc, cat) => {
    const catItems = filtered.filter((i) => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});

  // Also group uncategorized items
  const uncategorized = filtered.filter((i) => !i.category || !categories.includes(i.category));
  if (uncategorized.length > 0) grouped['Other'] = uncategorized;

  const cartCount = getItemCount();
  const cartTotal = getTotal();

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <EmptyState icon="≡ƒì╜∩╕Å" title={error} description="Check the URL and try again." />
    </div>
  );

  return (
    <div className="min-h-screen bg-white pb-32">
      {/* Hero Header * /}
      <div ref={headerRef} className="sticky top-0 z-20 bg-white shadow-sm">
        {/* Restaurant banner * /}
        {!loading && restaurant && (
          <div className="bg-gradient-to-r from-[#1A1A2E] to-[#16213E] px-4 pt-5 pb-4">
            <h1 className="text-xl font-bold text-white">{restaurant.name}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-white/60 text-xs">
              {restaurant.cuisine_type && <span>{restaurant.cuisine_type}</span>}
              {restaurant.cuisine_type && restaurant.opening_time && <span>┬╖</span>}
              {restaurant.opening_time && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {restaurant.opening_time} ΓÇô {restaurant.closing_time}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Search + Veg filter * /}
        <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search dishesΓÇª"
              className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-[#FF6B35] transition-all"
            />
          </div>
          <button onClick={() => setVegOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all flex-shrink-0 ${vegOnly ? 'bg-green-50 border-green-400 text-green-700' : 'border-gray-200 text-gray-500'}`}>
            <Leaf size={14} className={vegOnly ? 'text-green-600' : ''} />
            Veg
          </button>
        </div>

        {/* Category pills * /}
        {!loading && Object.keys(grouped).length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide">
            {Object.keys(grouped).map((cat) => (
              <button key={cat} onClick={() => scrollToCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${activeCategory === cat ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {cat} ({grouped[cat].length})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Menu Content * /}
      <div className="px-4 py-4 space-y-8">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-5 w-32 rounded" />
              {Array.from({ length: 3 }).map((__, j) => <SkeletonCard key={j} variant="menu-item" />)}
            </div>
          ))
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState icon="≡ƒöì" title="No items found" description={search ? 'Try a different search' : 'Menu is empty'} />
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} ref={el => categoryRefs.current[cat] = el}>
              <h2 className="text-base font-bold text-[#1A1A2E] mb-3 flex items-center gap-2">
                <span>{cat}</span>
                <span className="text-xs font-normal text-gray-400">({catItems.length})</span>
              </h2>
              <div className="space-y-3">
                {catItems.map((item) => {
                  const qty = getQuantity(item.id);
                  return (
                    <div key={item.id} className="bg-white rounded-[12px] border border-gray-100 shadow-sm flex gap-3 overflow-hidden hover:shadow-md transition-shadow animate-fade-in">
                      {/* Item info * /}
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`w-3 h-3 rounded-sm border-2 flex-shrink-0 flex items-center justify-center ${item.is_veg ? 'border-green-600' : 'border-red-600'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${item.is_veg ? 'bg-green-600' : 'bg-red-600'}`} />
                          </span>
                          {item.is_bestseller && (
                            <Badge variant="warning" size="xs">Γ¡É Bestseller</Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-[#1A1A2E] text-sm leading-tight">{item.name}</h3>
                        {item.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2.5">
                          <span className="font-bold text-[#FF6B35]">{formatIndianPrice(item.price)}</span>
                          {item.prep_time_minutes && (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock size={10} />
                              {formatTime(item.prep_time_minutes)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Image + Add button * /}
                      <div className="relative flex-shrink-0 w-28">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover min-h-[100px]" />
                        ) : (
                          <div className="w-full min-h-[100px] bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center text-3xl">
                            {item.is_veg ? '≡ƒÑù' : '≡ƒìù'}
                          </div>
                        )}
                        {/* Add/Qty control * /}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                          {qty === 0 ? (
                            <button onClick={() => handleAdd(item)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white border-2 border-[#FF6B35] text-[#FF6B35] rounded-xl text-sm font-bold shadow-md hover:bg-[#FF6B35] hover:text-white transition-all active:scale-95">
                              <Plus size={14} /> ADD
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 bg-[#FF6B35] text-white rounded-xl px-2 py-1.5 shadow-md">
                              <button onClick={() => updateQuantity(item.id, qty - 1)} className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors">
                                <Minus size={13} />
                              </button>
                              <span className="text-sm font-bold min-w-[16px] text-center">{qty}</span>
                              <button onClick={() => addItem(item)} className="hover:bg-[#E55A24] rounded-lg p-0.5 transition-colors">
                                <Plus size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Cart Bar * /}
      {cartCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-30 animate-bounce-in">
          <button onClick={() => setIsCartSheetOpen(true)}
            className="w-full flex items-center justify-between bg-[#1A1A2E] text-white rounded-2xl px-5 py-4 shadow-2xl hover:bg-[#16213E] active:scale-95 transition-all">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-[#FF6B35] rounded-xl text-sm font-bold">
                {cartCount}
              </div>
              <span className="font-semibold text-sm">{cartCount} item{cartCount > 1 ? 's' : ''} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold">{formatIndianPrice(cartTotal)}</span>
              <span className="text-white/60 text-sm">Proceed to Pay ΓåÆ</span>
            </div>
          </button>
        </div>
      )}

      <BottomSheet
        isOpen={isCartSheetOpen}
        onClose={() => setIsCartSheetOpen(false)}
        title="Your Cart"
        maxHeight="85vh"
      >
        <div className="p-4 space-y-4">
          {items.length === 0 ? (
            <EmptyState icon="≡ƒ¢Æ" title="Cart is empty" description="Add items from menu to continue." />
          ) : (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                {items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div className="h-px bg-gray-100 mx-4" />}
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1A1A2E] truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.quantity} x {formatIndianPrice(item.price)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-[#FF6B35]">
                        {formatIndianPrice(item.quantity * item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">{formatIndianPrice(cartTotal)}</span>
                </div>
                <div className="h-px bg-gray-100 my-3" />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1A1A2E]">Final Total</span>
                  <span className="font-bold text-[#FF6B35] text-lg">{formatIndianPrice(cartTotal)}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsCartSheetOpen(false);
                  navigate('/checkout');
                }}
                className="w-full bg-[#FF6B35] text-white rounded-2xl py-3.5 font-semibold hover:bg-[#E55A24] transition-colors"
              >
                Proceed to Pay
              </button>
            </>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

*/
