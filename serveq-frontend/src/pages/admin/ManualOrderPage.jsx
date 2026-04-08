import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, Search, Ticket, CheckCircle2, ArrowRight, ListOrdered } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminSidebar from '../../components/layout/AdminSidebar';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatIndianPrice } from '../../utils/helpers';

function getTodayIsoRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function ManualOrderPage() {
  const navigate = useNavigate();
  const { restaurantId, restaurantName } = useAuth();
  const supabaseRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screenError, setScreenError] = useState('');
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState('eat');
  const [customerName, setCustomerName] = useState('');
  const [cart, setCart] = useState([]);
  const [createdOrder, setCreatedOrder] = useState(null);

  const loadMenu = async () => {
    if (!restaurantId || !supabaseRef.current) return;

    const [catRes, itemRes] = await Promise.all([
      supabaseRef.current
        .from('menu_categories')
        .select('id, name, sort_order')
        .eq('restaurant_id', restaurantId)
        .order('sort_order', { ascending: true }),
      supabaseRef.current
        .from('menu_items')
        .select('id, name, description, price, is_available, category_id')
        .eq('restaurant_id', restaurantId)
        .eq('is_available', true)
        .order('sort_order', { ascending: true }),
    ]);

    if (catRes.error || itemRes.error) {
      throw new Error('Unable to load menu');
    }

    setCategories(catRes.data || []);
    setItems(itemRes.data || []);
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        supabaseRef.current = getSupabaseClient();
        await loadMenu();
      } catch {
        if (mounted) setScreenError('Could not load menu data. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [restaurantId]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategoryId !== 'all' && item.category_id !== activeCategoryId) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        (item.description || '').toLowerCase().includes(query)
      );
    });
  }, [items, activeCategoryId, search]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, c) => sum + Number(c.price || 0) * Number(c.quantity || 0), 0),
    [cart]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, c) => sum + Number(c.quantity || 0), 0),
    [cart]
  );

  const getQty = (itemId) => cart.find((c) => c.id === itemId)?.quantity || 0;

  const addItem = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { id: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
  };

  const decrementItem = (itemId) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === itemId);
      if (!existing) return prev;
      if (existing.quantity <= 1) return prev.filter((c) => c.id !== itemId);
      return prev.map((c) => (c.id === itemId ? { ...c, quantity: c.quantity - 1 } : c));
    });
  };

  const clearBuilder = () => {
    setCart([]);
    setCustomerName('');
    setOrderType('eat');
  };

  const getNextTokenNumber = async () => {
    const { start, end } = getTodayIsoRange();

    const { count, error } = await supabaseRef.current
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', start)
      .lte('created_at', end);

    if (error) throw error;
    return (count || 0) + 1;
  };

  const createManualOrder = async () => {
    if (!restaurantId) {
      toast.error('Restaurant context is missing');
      return;
    }
    if (!cart.length) {
      toast.error('Add at least one item');
      return;
    }

    setSaving(true);
    try {
      const tokenNumber = await getNextTokenNumber();

      const { data: order, error: orderErr } = await supabaseRef.current
        .from('orders')
        .insert({
          restaurant_id: restaurantId,
          token_number: tokenNumber,
          status: 'pending',
          payment_type: 'cash',
          payment_status: 'paid',
          total_amount: cartTotal,
          customer_name: customerName.trim() || null,
          order_type: orderType,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderErr || !order) throw new Error('Could not create order');

      const itemRows = cart.map((c) => ({
        order_id: order.id,
        menu_item_id: c.id,
        item_name: c.name,
        item_price: c.price,
        quantity: c.quantity,
      }));

      const { error: itemsErr } = await supabaseRef.current.from('order_items').insert(itemRows);
      if (itemsErr) {
        await supabaseRef.current.from('orders').delete().eq('id', order.id);
        throw itemsErr;
      }

      setCreatedOrder({ id: order.id, token: tokenNumber, amount: cartTotal });
      clearBuilder();
      toast.success(`Token #${tokenNumber} created`);
    } catch {
      toast.error('Unable to create manual order');
    } finally {
      setSaving(false);
    }
  };

  if (screenError) {
    return (
      <div className="flex h-screen overflow-hidden bg-white">
        <AdminSidebar />
        <main className="flex-1 p-6">
          <EmptyState
            icon="😕"
            title="Could not open Manual Order panel"
            description={screenError}
            actionLabel="Retry"
            onAction={() => window.location.reload()}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFAFB]">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 md:px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#1A1A2E]">Staff POS · Manual Order</h1>
              <p className="text-sm text-gray-500 mt-1">
                Add walk-in cash orders here. They join the same live queue in FCFS order.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<ListOrdered size={14} />}
              onClick={() => navigate('/admin/orders')}
            >
              Live Orders
            </Button>
          </div>
        </div>

        <div className="p-4 md:p-6 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <section className="bg-white border border-gray-100 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                onClick={() => setActiveCategoryId('all')}
                className={`px-3 py-2 rounded-full text-xs font-semibold ${activeCategoryId === 'all' ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600'
                  }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={`px-3 py-2 rounded-full text-xs font-semibold ${activeCategoryId === cat.id ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items"
                className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            {loading ? (
              <p className="text-sm text-gray-400">Loading menu...</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-sm text-gray-400">No matching items found.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredItems.map((item) => {
                  const qty = getQty(item.id);
                  return (
                    <div key={item.id} className="border border-gray-100 rounded-xl p-3 bg-white">
                      <p className="text-sm font-semibold text-[#1A1A2E]">{item.name}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description || 'No description'}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-[#FF6B35]">{formatIndianPrice(item.price)}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => decrementItem(item.id)}
                            className="h-8 w-8 rounded-lg border border-gray-200 text-gray-600 flex items-center justify-center"
                            disabled={!qty}
                          >
                            <Minus size={14} />
                          </button>
                          <span className="min-w-5 text-center text-sm font-semibold">{qty}</span>
                          <button
                            onClick={() => addItem(item)}
                            className="h-8 w-8 rounded-lg bg-[#FF6B35] text-white flex items-center justify-center"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="bg-white border border-gray-100 rounded-2xl p-4 h-fit sticky top-24">
            <h2 className="text-base font-bold text-[#1A1A2E]">Current Manual Order</h2>
            <p className="text-xs text-gray-500 mt-1">{restaurantName || 'Restaurant'} · Cash paid at counter</p>

            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">Order Type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOrderType('eat')}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold border ${orderType === 'eat' ? 'border-[#FF6B35] text-[#FF6B35] bg-orange-50' : 'border-gray-200 text-gray-600'
                    }`}
                >
                  Eat
                </button>
                <button
                  onClick={() => setOrderType('parcel')}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold border ${orderType === 'parcel' ? 'border-[#FF6B35] text-[#FF6B35] bg-orange-50' : 'border-gray-200 text-gray-600'
                    }`}
                >
                  Parcel
                </button>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs text-gray-500 mb-2">Customer Name (Optional)</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in customer"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
              {cart.length === 0 ? (
                <p className="text-xs text-gray-400">No items added yet.</p>
              ) : (
                cart.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{c.quantity}x {c.name}</span>
                    <span className="font-semibold text-[#1A1A2E]">{formatIndianPrice(c.quantity * c.price)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">Items: {cartCount}</span>
              <span className="text-lg font-extrabold text-[#FF6B35]">{formatIndianPrice(cartTotal)}</span>
            </div>

            <div className="mt-4 space-y-2">
              <Button
                fullWidth
                className="min-h-11"
                loading={saving}
                disabled={cart.length === 0}
                onClick={createManualOrder}
                icon={<Ticket size={16} />}
              >
                Create Cash Order (Paid)
              </Button>
              <Button
                fullWidth
                variant="outline"
                className="min-h-11"
                onClick={clearBuilder}
                disabled={!cart.length && !customerName}
              >
                Clear
              </Button>
            </div>

            {createdOrder ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={18} className="text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-emerald-800">Token #{createdOrder.token} Created</p>
                    <p className="text-xs text-emerald-700 mt-1">
                      Added to live queue with all other tokens in FCFS order.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <Button
                    fullWidth
                    size="sm"
                    variant="secondary"
                    icon={<ArrowRight size={14} />}
                    onClick={() => navigate('/admin/orders')}
                  >
                    Go to Live Orders
                  </Button>
                  <Button
                    fullWidth
                    size="sm"
                    variant="outline"
                    onClick={() => setCreatedOrder(null)}
                  >
                    Create Another Order
                  </Button>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}
