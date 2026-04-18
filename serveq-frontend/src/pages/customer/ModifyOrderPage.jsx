import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Info, Loader2, Minus, Plus, Search } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { formatIndianPrice } from '../../utils/helpers';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import SkeletonCard from '../../components/ui/SkeletonCard';

export default function ModifyOrderPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const [order, setOrder] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);

  // Local state for the "modification cart"
  // Each item is { id, name, price, quantity, customizationNote }
  const [modItems, setModItems] = useState([]);
  
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [isPreviewSheetOpen, setIsPreviewSheetOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Order and its existing items
      const { data: orderData, error: oErr } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single();

      if (oErr || !orderData) throw new Error('Order not found');
      if (!['pending', 'preparing'].includes(orderData.status)) {
        throw new Error('This order can no longer be modified.');
      }

      setOrder(orderData);

      // 2. Fetch Restaurant & Menu
      const [restRes, catRes, itemRes] = await Promise.all([
        supabase.from('restaurants').select('id, name, slug').eq('id', orderData.restaurant_id).single(),
        supabase.from('menu_categories').select('id, name').eq('restaurant_id', orderData.restaurant_id).order('sort_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', orderData.restaurant_id).eq('is_available', true).order('sort_order')
      ]);

      if (restRes.error) throw restRes.error;
      setRestaurant(restRes.data);
      setCategories(['All', ...catRes.data.map(c => c.name)]);

      const categoryById = new Map(catRes.data.map(c => [c.id, c.name]));
      const normalizedItems = itemRes.data.map(item => ({
        ...item,
        category: categoryById.get(item.category_id) || 'Other'
      }));
      setMenuItems(normalizedItems);

      // 3. Initialize Mod Items from original order
      const initialItems = orderData.order_items.map(oi => ({
        id: oi.menu_item_id,
        name: oi.item_name,
        price: oi.item_price,
        quantity: oi.quantity,
        customizationNote: oi.customization_note
      }));
      setModItems(initialItems);

    } catch (err) {
      setError(err.message || 'Failed to load modification screen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId && supabase) {
      fetchData();
    }
  }, [orderId, supabase]);

  const updateModQuantity = (item, delta) => {
    setModItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) return prev.filter(i => i.id !== item.id);
        return prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i);
      } else if (delta > 0) {
        return [...prev, {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          customizationNote: null
        }];
      }
      return prev;
    });
  };

  const getFilteredItems = () => {
    return menuItems.filter(item => {
      if (activeCategory !== 'All' && item.category !== activeCategory) return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  };

  const handlePreview = async () => {
    if (modItems.length === 0) {
      toast.error('Cart cannot be empty. Please add items.');
      return;
    }
    
    setProcessing(true);
    try {
      const payload = modItems.map(i => ({
        menu_item_id: i.id,
        quantity: i.quantity,
        customization_note: i.customizationNote
      }));

      const { data } = await api.post(`/modifications/${orderId}/modification-preview`, { newItems: payload });
      setPreviewData(data);
      setIsPreviewSheetOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to calculate diff');
    } finally {
      setProcessing(false);
    }
  };

  const handleCommit = async () => {
    setProcessing(true);
    try {
      // If it's a top-up, we should theoretically handle payment here.
      // But for now, we just apply the modification.
      const payload = {
        items: previewData.proposedItems,
        newTotal: previewData.newTotal,
        difference: previewData.difference
      };

      await api.post(`/modifications/${orderId}/apply-modification`, payload);
      toast.success('Order updated successfully!');
      navigate(`/order/${orderId}`, { replace: true });
    } catch (err) {
      toast.error('Failed to update order');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return (
    <div className="p-4 space-y-4">
      <div className="skeleton h-10 w-48 rounded" />
      <SkeletonCard variant="menu-item" />
      <SkeletonCard variant="menu-item" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <p className="text-red-500 mb-4">{error}</p>
      <Button onClick={() => navigate(-1)}>Go Back</Button>
    </div>
  );

  const modTotal = modItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  const originalTotal = order.total_amount;

  return (
    <div className="min-h-screen bg-white pb-32">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} className="text-[#1A1A2E]" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#1A1A2E]">Modify Order #{order.token_number}</h1>
            <p className="text-xs text-gray-400">Changed your mind? Update items below.</p>
          </div>
        </div>

        <div className="px-4 py-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for something else..."
              className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                activeCategory === cat ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Menu List */}
      <div className="px-4 py-4 space-y-4">
        {getFilteredItems().map(item => {
          const modItem = modItems.find(i => i.id === item.id);
          const qty = modItem ? modItem.quantity : 0;
          
          return (
            <div key={item.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-2xl">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-[#1A1A2E]">{item.name}</h3>
                <p className="text-xs text-orange-500 font-bold">{formatIndianPrice(item.price)}</p>
              </div>
              
              <div className="flex items-center bg-gray-100 rounded-xl px-2 py-1 gap-3">
                <button onClick={() => updateModQuantity(item, -1)} className="p-1 hover:bg-gray-200 rounded">
                  <Minus size={14} />
                </button>
                <span className="text-sm font-bold w-4 text-center">{qty}</span>
                <button onClick={() => updateModQuantity(item, 1)} className="p-1 hover:bg-gray-200 rounded">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Summary Bar */}
      <div className="fixed bottom-6 left-4 right-4 z-30">
        <button
          onClick={handlePreview}
          disabled={processing}
          className="w-full min-h-[56px] flex items-center justify-between bg-[#1A1A2E] text-white rounded-2xl px-5 py-4 shadow-xl active:scale-95 transition-all disabled:opacity-50"
        >
          <div className="flex flex-col items-start">
            <span className="text-xs text-white/60">New Total</span>
            <span className="font-bold text-lg">{formatIndianPrice(modTotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            {processing ? <Loader2 className="animate-spin" size={20} /> : <span className="font-bold">Review Changes ΓåÆ</span>}
          </div>
        </button>
      </div>

      {/* Preview Sheet */}
      <BottomSheet isOpen={isPreviewSheetOpen} onClose={() => setIsPreviewSheetOpen(false)} title="Review Modifications">
        <div className="p-4 space-y-4">
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Original Total</span>
              <span className="font-medium">{formatIndianPrice(originalTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">New Total</span>
              <span className="font-medium">{formatIndianPrice(previewData?.newTotal)}</span>
            </div>
            <div className="h-px bg-gray-200 my-2" />
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#1A1A2E]">Difference</span>
              <span className={`text-lg font-bold ${previewData?.difference >= 0 ? 'text-[#FF6B35]' : 'text-green-600'}`}>
                {previewData?.difference === 0 ? 'No change' : (previewData?.difference > 0 ? `+ ${formatIndianPrice(previewData.difference)}` : `- ${formatIndianPrice(Math.abs(previewData.difference))}`)}
              </span>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2">
            <Info size={16} className="text-blue-600 mt-0.5" />
            <p className="text-xs text-blue-800 leading-relaxed">
              {previewData?.difference > 0 
                ? "You will need to pay the extra balance at the counter or via UPI."
                : previewData?.difference < 0 
                ? "The restaurant will refund the difference to you at the counter."
                : "Your order total remains the same."}
            </p>
          </div>

          <Button 
            variant="primary" 
            fullWidth 
            size="lg" 
            loading={processing}
            onClick={handleCommit}
          >
            Confirm & Update Order
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
