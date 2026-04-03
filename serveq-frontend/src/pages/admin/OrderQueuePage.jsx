import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Clock3,
  Loader2,
  RefreshCw,
  Wallet,
  XCircle,
} from 'lucide-react';
import AdminSidebar from '../../components/layout/AdminSidebar';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatIndianPrice, timeAgo } from '../../utils/helpers';
import toast from 'react-hot-toast';

const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
};

export default function OrderQueuePage() {
  const { restaurantId, restaurantName } = useAuth();
  const supabaseRef = useRef(null);
  const [orders, setOrders] = useState([]);
  const [newOrderIds, setNewOrderIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [screenError, setScreenError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [savingStatusIds, setSavingStatusIds] = useState({});
  const [refundingIds, setRefundingIds] = useState({});
  const [cashCollectedIds, setCashCollectedIds] = useState({});

  const fetchOrders = useCallback(async () => {
    if (!restaurantId || !supabaseRef.current) return;
    const { start, end } = getTodayRange();
    try {
      setScreenError('');
      const { data, error } = await supabaseRef.current
        .from('orders')
        .select('*, order_items(*)')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setOrders(data || []);
    } catch {
      setScreenError('We couldn’t load your orders. Please check your connection and try again.');
    }
  }, [restaurantId]);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        supabaseRef.current = getSupabaseClient();
      } catch {
        setScreenError('We couldn’t connect to QATO right now. Please try again.');
        setLoading(false);
        return;
      }
      await fetchOrders();
      if (isMounted) setLoading(false);
    };
    init();
    return () => {
      isMounted = false;
    };
  }, [fetchOrders, restaurantId]);

  useEffect(() => {
    if (!restaurantId || !supabaseRef.current) return;

    const channel = supabaseRef.current
      .channel(`admin-orders:${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
          const newOrder = payload.new;
          if (!newOrder) return;

          const { data: itemsData } = await supabaseRef.current
            .from('order_items')
            .select('*')
            .eq('order_id', newOrder.id);

          const orderWithItems = { ...newOrder, order_items: itemsData || [] };
          setOrders((prev) => [orderWithItems, ...prev.filter((o) => o.id !== newOrder.id)]);
          setNewOrderIds((prev) => [newOrder.id, ...prev.filter((id) => id !== newOrder.id)]);
          setTimeout(() => {
            setNewOrderIds((prev) => prev.filter((id) => id !== newOrder.id));
          }, 3000);

          toast.custom((t) => (
            <div className={`flex items-center gap-3 px-4 py-3 bg-[#1A1A2E] text-white rounded-xl shadow-xl ${t.visible ? 'animate-bounce-in' : ''}`}>
              <Bell size={18} className="text-[#FF6B35]" />
              <div>
                <p className="text-sm font-semibold">New Token #{newOrder.token_number}</p>
                <p className="text-xs text-white/60">{formatIndianPrice(newOrder.total_amount)}</p>
              </div>
            </div>
          ), { duration: 4000 });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const updated = payload.new;
          if (!updated) return;
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
        }
      )
      .subscribe();

    return () => {
      supabaseRef.current?.removeChannel(channel);
    };
  }, [restaurantId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const setOrderStatus = async (orderId, status) => {
    setSavingStatusIds((prev) => ({ ...prev, [orderId]: true }));
    try {
      const { error } = await supabaseRef.current
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
      toast.success(`Order marked as ${status}`);
    } catch {
      toast.error('Unable to update status');
    } finally {
      setSavingStatusIds((prev) => ({ ...prev, [orderId]: false }));
    }
  };



  const toggleCashCollected = async (orderId, checked) => {
    setCashCollectedIds((prev) => ({ ...prev, [orderId]: true }));
    try {
      const { error } = await supabaseRef.current
        .from('orders')
        .update({ payment_status: checked ? 'paid' : 'pending', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
    } catch {
      toast.error('Unable to update cash collection state');
    } finally {
      setCashCollectedIds((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const issueRefund = async (order) => {
    if (!order?.razorpay_payment_id) {
      toast.error('No payment ID found for refund');
      return;
    }
    setRefundingIds((prev) => ({ ...prev, [order.id]: true }));
    try {
      const { data, error } = await supabaseRef.current.functions.invoke('issue-razorpay-refund', {
        body: {
          order_id: order.id,
          razorpay_payment_id: order.razorpay_payment_id,
          restaurant_id: restaurantId,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error('Refund failed');
      toast.success('Refund issued');
    } catch {
      toast.error('Could not issue refund');
    } finally {
      setRefundingIds((prev) => ({ ...prev, [order.id]: false }));
    }
  };

  const activeOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === 'pending' || o.status === 'preparing')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [orders]);

  const activeItemsSummary = useMemo(() => {
    const counts = {};
    activeOrders.forEach(order => {
      (order.order_items || []).forEach(item => {
        const name = item.item_name || item.name;
        counts[name] = (counts[name] || 0) + item.quantity;
      });
    });
    return Object.entries(counts).map(([name, qty]) => ({ name, qty }));
  }, [activeOrders]);

  const totalToday = useMemo(() => {
    const revenue = (orders || [])
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    return { count: orders.length, revenue };
  }, [orders]);

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const renderPaymentBadge = (order) => {
    if (order.payment_type === 'upi') {
      return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${order.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          UPI {order.payment_status === 'paid' ? '✓ Paid' : 'Pending'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        Cash 💵
      </span>
    );
  };

  const renderOrderCard = (order) => {
    const isSavingStatus = Boolean(savingStatusIds[order.id]);

    return (
      <div
        key={order.id}
        className={[
          'bg-white rounded-2xl border border-gray-100 shadow-sm p-4',
          'transition-all',
          newOrderIds.includes(order.id) ? 'ring-2 ring-[#FF6B35]/40 bg-orange-50/40' : '',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-extrabold text-[#1A1A2E] leading-none">Token #{order.token_number}</p>
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Clock3 size={12} />
              {timeAgo(order.created_at)}
            </p>
          </div>
          <div className="text-right space-y-2">
            {renderPaymentBadge(order)}
            <p className="text-lg font-bold text-[#FF6B35]">{formatIndianPrice(order.total_amount)}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {(order.order_items || []).map((item, idx) => (
            <div key={idx} className="text-sm text-gray-700 flex justify-between gap-3">
              <span className="min-w-0">{item.quantity}x {item.item_name || item.name}</span>
              <span className="text-gray-500 shrink-0">{formatIndianPrice((item.item_price || item.price || 0) * item.quantity)}</span>
            </div>
          ))}
          {(order.order_items || []).some((i) => i.customization_note) && (
            <div className="pt-1">
              {(order.order_items || [])
                .filter((i) => i.customization_note)
                .map((i, idx) => (
                  <p key={idx} className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-1">
                    📝 {i.customization_note}
                  </p>
                ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[auto] gap-3 items-end justify-end">

          <div className="flex flex-wrap gap-2">
            {order.status === 'pending' && (
              <Button
                size="md"
                className="min-h-11 px-4 bg-blue-600 hover:bg-blue-700"
                loading={isSavingStatus}
                onClick={() => setOrderStatus(order.id, 'preparing')}
              >
                Start Preparing
              </Button>
            )}

            {order.status === 'preparing' && (
              <>
                {order.payment_type === 'cash' ? (
                  <Button
                    size="md"
                    className="min-h-11 px-4 bg-red-600 hover:bg-red-700"
                    loading={isSavingStatus}
                    onClick={() => setOrderStatus(order.id, 'done')}
                  >
                    Receive cash & mark as done
                  </Button>
                ) : (
                  <Button
                    size="md"
                    className="min-h-11 px-4 bg-green-600 hover:bg-green-700"
                    loading={isSavingStatus}
                    onClick={() => setOrderStatus(order.id, 'done')}
                  >
                    Mark as Done
                  </Button>
                )}
                <Button
                  size="md"
                  variant="outline"
                  className="min-h-11 px-4 border-red-300 text-red-600 hover:bg-red-50"
                  loading={isSavingStatus}
                  onClick={() => setOrderStatus(order.id, 'cancelled')}
                >
                  <XCircle size={16} />
                  Cancel Order
                </Button>
              </>
            )}

            {order.status === 'done' && (
              <span className="inline-flex items-center min-h-11 px-4 rounded-xl bg-gray-100 text-gray-500 text-sm font-semibold">
                Completed
              </span>
            )}
          </div>
        </div>



        {order.payment_type === 'upi' && order.status === 'cancelled' && (
          <div className="mt-4">
            <Button
              variant="outline"
              className="min-h-11 px-4 border-[#FF6B35] text-[#FF6B35] hover:bg-orange-50"
              loading={Boolean(refundingIds[order.id])}
              onClick={() => issueRefund(order)}
            >
              Issue Refund
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <AdminSidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 md:px-6 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#1A1A2E] flex items-center">
                Live Orders
                <span className="relative flex h-2.5 w-2.5 ml-3 mt-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
              </h1>
              <div className="flex items-center gap-2 text-gray-500 text-sm mt-1">
                <CalendarDays size={14} />
                <span>{todayLabel}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <div className="px-3 py-2 rounded-xl bg-[#1A1A2E] text-white text-sm font-medium">
                Total today: {totalToday.count} orders | {formatIndianPrice(totalToday.revenue)} revenue
              </div>
              <div className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-[#1A1A2E]">
                {restaurantName || 'Restaurant'}
              </div>
              <Button variant="outline" size="sm" loading={refreshing} icon={<RefreshCw size={14} />} onClick={handleRefresh}>
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {screenError ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center space-y-3">
              <div className="text-5xl">😕</div>
              <h2 className="text-lg font-bold text-[#1A1A2E]">We couldn’t load your orders</h2>
              <p className="text-sm text-gray-500">{screenError}</p>
              <Button variant="primary" onClick={() => { setScreenError(''); handleRefresh(); }}>
                Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} variant="order-card" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <>
              <EmptyState
                icon="📭"
                title="No orders yet today. Your queue will appear here."
                description="When customers place an order, you’ll see it here instantly."
              />
            </>
          ) : (
            <>
              <section>
                <h2 className="text-lg font-bold text-[#1A1A2E] mb-3">Active Queue ({activeOrders.length})</h2>
                <div className="bg-[#1A1A2E] text-white rounded-xl p-4 mb-5 shadow-sm">
                  <span className="text-[#FF6B35] font-bold block mb-3 text-sm uppercase tracking-wider">Item Summary</span>
                  {activeItemsSummary.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                       {activeItemsSummary.map(({name, qty}) => (
                           <div key={name} className="flex justify-between items-center bg-white/10 px-3 py-2 rounded-lg text-sm">
                             <span className="truncate pr-2">{name}</span>
                             <span className="font-bold text-[#FF6B35] bg-white/10 px-2 py-0.5 rounded-md">x{qty}</span>
                           </div>
                       ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">No items</span>
                  )}
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {activeOrders.map(renderOrderCard)}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
