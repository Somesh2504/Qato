import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle,
  Clock3,
  Loader2,
  Package,
  RefreshCw,
  UtensilsCrossed,
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
  const { restaurantId, restaurantName, subscriptionPlan, subscriptionEndDate } = useAuth();
  const supabaseRef = useRef(null);
  const [orders, setOrders] = useState([]);
  const [newOrderIds, setNewOrderIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [screenError, setScreenError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [savingStatusIds, setSavingStatusIds] = useState({});
  const [refundingIds, setRefundingIds] = useState({});
  const [cashCollectedIds, setCashCollectedIds] = useState({});
  const [markingDoneIds, setMarkingDoneIds] = useState({});

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
      setScreenError('We couldn\u2019t load your orders. Please check your connection and try again.');
    }
  }, [restaurantId]);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        supabaseRef.current = getSupabaseClient();
      } catch {
        setScreenError('We couldn\u2019t connect to QRAVE right now. Please try again.');
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

          if (newOrder.payment_type === 'upi' && newOrder.payment_status !== 'paid') return; // Silence unpaid until they trigger an UPDATE

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
          setOrders((prev) => {
            const existing = prev.find(o => o.id === updated.id);
            if (existing && existing.payment_type === 'upi' && existing.payment_status !== 'paid' && updated.payment_status === 'paid') {
              setNewOrderIds((prevIds) => [updated.id, ...prevIds.filter((id) => id !== updated.id)]);
              setTimeout(() => { setNewOrderIds((prevIds) => prevIds.filter((id) => id !== updated.id)); }, 3000);
              toast.custom((t) => (
                <div className={`flex items-center gap-3 px-4 py-3 bg-[#1A1A2E] text-white rounded-xl shadow-xl ${t.visible ? 'animate-bounce-in' : ''}`}>
                  <Bell size={18} className="text-[#FF6B35]" />
                  <div>
                    <p className="text-sm font-semibold">UPI Payment Received! Token #{updated.token_number}</p>
                    <p className="text-xs text-white/60">{formatIndianPrice(updated.total_amount)}</p>
                  </div>
                </div>
              ), { duration: 4000 });
            }
            return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
          });
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

  /* ──────────────────────────────────
     Mark a single order_item as done.
     When ALL items of a token are done,
     auto-mark the order as "done".
     ────────────────────────────────── */
  const markItemDone = async (orderItemId, orderId) => {
    setMarkingDoneIds((prev) => ({ ...prev, [orderItemId]: true }));
    try {
      const { error } = await supabaseRef.current
        .from('order_items')
        .update({ is_done: true })
        .eq('id', orderItemId);
      if (error) throw error;

      // Find the order before updating state to know if it's cash
      const currentOrder = orders.find(o => o.id === orderId);
      if (!currentOrder) return;
      const isCashOrder = currentOrder.payment_type === 'cash';

      const updatedItems = (currentOrder.order_items || []).map((item) =>
        item.id === orderItemId ? { ...item, is_done: true } : item
      );
      const allDone = updatedItems.every((item) => item.is_done);
      const tokenNumber = currentOrder.token_number;

      // Optimistic local state update - ATOMIC
      setOrders((prev) => {
        if (allDone && tokenNumber !== null && !isCashOrder) {
          // Remove from view entirely if it's UPI and all items are done
          return prev.filter((o) => o.id !== orderId);
        }
        // Otherwise just update the item to be done visually
        return prev.map((o) => (o.id === orderId ? { ...o, order_items: updatedItems } : o));
      });

      // Auto-complete order DB logic
      if (allDone && tokenNumber !== null) {
        if (isCashOrder) {
          toast.success(`Token #${tokenNumber} items ready! Collect cash to close order.`, { icon: '💵' });
        } else {
          await supabaseRef.current
            .from('orders')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .eq('id', orderId)
            .eq('restaurant_id', restaurantId);
          toast.success(`Token #${tokenNumber} — All items done! 🎉`);
        }
      }
    } catch {
      toast.error('Unable to mark item as done');
    } finally {
      setMarkingDoneIds((prev) => ({ ...prev, [orderItemId]: false }));
    }
  };

  const validOrders = useMemo(() => {
    return orders.filter(o => {
      // Hide un-paid UPI checkout sessions entirely from dashboard queues!
      if (o.payment_type === 'upi' && o.payment_status !== 'paid') return false;
      return true;
    });
  }, [orders]);

  const activeOrders = useMemo(() => {
    return validOrders
      .filter((o) => o.status === 'pending' || o.status === 'preparing')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [validOrders]);

  /* ──────────────────────────────────
     Dynamic item columns for the summary.
     Each column = one unique menu item name.
     Inside: token cards sorted by FCFS.
     ────────────────────────────────── */
  const itemColumns = useMemo(() => {
    const columns = {};
    activeOrders.forEach((order) => {
      (order.order_items || []).forEach((item) => {
        const name = item.item_name || item.name;
        if (!columns[name]) columns[name] = { name, totalQty: 0, pendingQty: 0, tokens: [] };
        columns[name].totalQty += item.quantity;
        if (!item.is_done) columns[name].pendingQty += item.quantity;
        columns[name].tokens.push({
          orderId: order.id,
          orderItemId: item.id,
          tokenNumber: order.token_number,
          quantity: item.quantity,
          orderType: order.order_type || 'eat',
          isDone: item.is_done || false,
          createdAt: order.created_at,
        });
      });
    });
    // Sort tokens in each column by FCFS (ascending created_at)
    Object.values(columns).forEach((col) => {
      col.tokens.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    });
    return Object.values(columns);
  }, [activeOrders]);

  const totalToday = useMemo(() => {
    const revenue = (validOrders || [])
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    return { count: validOrders.length, revenue };
  }, [validOrders]);

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

  const renderOrderTypeBadge = (order) => {
    const type = order.order_type || 'eat';
    if (type === 'parcel') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-700">
          <Package size={11} /> Parcel
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
        <UtensilsCrossed size={11} /> Eat
      </span>
    );
  };

  const renderOrderCard = (order) => {
    const isSavingStatus = Boolean(savingStatusIds[order.id]);
    const allItemsDone = (order.order_items || []).length > 0 && (order.order_items || []).every((i) => i.is_done);

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
            <div className="flex items-center gap-2">
              <p className="text-2xl font-extrabold text-[#1A1A2E] leading-none">Token #{order.token_number}</p>
              {renderOrderTypeBadge(order)}
            </div>
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
            <div key={idx} className={`text-sm flex justify-between gap-3 ${item.is_done ? 'line-through text-gray-300' : 'text-gray-700'}`}>
              <span className="min-w-0 flex items-center gap-1.5">
                {item.is_done && <CheckCircle size={13} className="text-green-500 flex-shrink-0" />}
                {item.quantity}x {item.item_name || item.name}
              </span>
              <span className="shrink-0">{formatIndianPrice((item.item_price || item.price || 0) * item.quantity)}</span>
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

        <div className="mt-4 flex flex-wrap gap-2 items-end justify-end">
          {(!allItemsDone && order.status === 'pending') && (
            <Button
              size="md"
              className="min-h-11 px-4 bg-blue-600 hover:bg-blue-700"
              loading={isSavingStatus}
              onClick={() => setOrderStatus(order.id, 'preparing')}
            >
              Start Preparing
            </Button>
          )}

          {((order.status === 'preparing' || allItemsDone) && order.status !== 'done') && (
            <>
              {order.payment_type === 'cash' ? (
                <Button
                  size="md"
                  className={`min-h-11 px-4 transition-all ${allItemsDone ? 'bg-red-600 hover:bg-red-700 font-bold ring-4 ring-red-100 shadow-lg' : 'bg-red-600 hover:bg-red-700'}`}
                  loading={isSavingStatus}
                  onClick={() => {
                    setOrders((prev) => prev.filter((o) => o.id !== order.id)); // Optimistic UI clear
                    setOrderStatus(order.id, 'done');
                  }}
                >
                  {allItemsDone ? "Receive cash & close order 💵" : "Receive cash & mark as done"}
                </Button>
              ) : (
                !allItemsDone ? (
                  <Button
                    size="md"
                    className="min-h-11 px-4 bg-green-600 hover:bg-green-700"
                    loading={isSavingStatus}
                    onClick={() => setOrderStatus(order.id, 'done')}
                  >
                    Mark as Done
                  </Button>
                ) : (
                  <Button
                    size="md"
                    className="min-h-11 px-4 bg-emerald-600 hover:bg-emerald-700 ring-4 ring-emerald-100 shadow-lg font-bold"
                    loading={isSavingStatus}
                    onClick={() => {
                      setOrders((prev) => prev.filter((o) => o.id !== order.id)); // Optimistic UI clear
                      setOrderStatus(order.id, 'done');
                    }}
                  >
                    All Items Done — Close Order ✨
                  </Button>
                )
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
        {/* ─── Sticky Header (UNCHANGED) ─── */}
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

        {/* ─── Content ─── */}
        <div className="p-4 md:p-6 space-y-6">
          {/* ─── Subscription Expiry Warning ─── */}
          {(() => {
            if (!subscriptionEndDate) return null;
            const now = new Date();
            const end = new Date(subscriptionEndDate);
            const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
            if (daysLeft > 2) return null;
            const isExpired = daysLeft < 0;
            return (
              <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 animate-pulse ${
                isExpired
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <AlertTriangle size={22} className={isExpired ? 'text-red-500 mt-0.5' : 'text-amber-500 mt-0.5'} />
                <div>
                  <p className={`font-bold text-sm ${isExpired ? 'text-red-700' : 'text-amber-700'}`}>
                    {isExpired
                      ? `⚠️ Your subscription (${subscriptionPlan || 'Free'}) has expired!`
                      : `⚠️ Your subscription (${subscriptionPlan || 'Free'}) ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}!`
                    }
                  </p>
                  <p className={`text-xs mt-1 ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                    {isExpired
                      ? 'Please renew your subscription immediately to avoid service interruption. Contact the QRAVE team.'
                      : 'Please renew your subscription to continue receiving orders without interruption. Contact the QRAVE team.'
                    }
                  </p>
                </div>
              </div>
            );
          })()}
          {screenError ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center space-y-3">
              <div className="text-5xl">😕</div>
              <h2 className="text-lg font-bold text-[#1A1A2E]">We couldn't load your orders</h2>
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
                description="When customers place an order, you'll see it here instantly."
              />
            </>
          ) : (
            <>
              <section>
                <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">Active Queue ({activeOrders.length})</h2>

                {/* ═══════════════════════════════════════
                    ITEM SUMMARY COLUMNS
                    Dynamic columns — one per unique item.
                    ═══════════════════════════════════════ */}
                {itemColumns.length > 0 ? (
                  <div className="flex flex-nowrap overflow-x-auto gap-4 mb-8 pb-4 snap-x hide-scrollbar">
                    {itemColumns.map((col) => {
                      const pendingTokens = col.tokens.filter((t) => !t.isDone);
                      const doneTokens = col.tokens.filter((t) => t.isDone);
                      return (
                        <div
                          key={col.name}
                          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-w-[300px] w-[300px] shrink-0 snap-center"
                        >
                          {/* Column Header */}
                          <div className="px-4 py-3 bg-gradient-to-r from-[#1A1A2E] to-[#2d2d4e] flex items-center justify-between">
                            <h3 className="text-white font-bold uppercase tracking-wider text-sm">{col.name}</h3>
                            <span className="bg-[#FF6B35] text-white text-xl font-black min-w-[32px] text-center px-1.5 py-0.5 rounded-full shadow-lg shadow-orange-500/30">
                              {col.pendingQty}
                            </span>
                          </div>

                          {/* Token Cards */}
                          <div className="p-3 space-y-2 flex-1 max-h-80 overflow-y-auto">
                            {pendingTokens.length === 0 && doneTokens.length > 0 && (
                              <p className="text-center text-sm text-gray-400 py-4">All done! ✨</p>
                            )}
                            {pendingTokens.length === 0 && doneTokens.length === 0 && (
                              <p className="text-center text-sm text-gray-300 py-4">No orders</p>
                            )}
                            {pendingTokens.map((token) => (
                              <div
                                key={token.orderItemId}
                                className="flex items-center justify-between gap-2 bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-2.5 border border-gray-100 transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="text-sm font-bold text-[#1A1A2E] whitespace-nowrap">
                                    Token {token.tokenNumber}
                                  </span>
                                  <span className="text-xs font-semibold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                                    ×{token.quantity}
                                  </span>
                                  <span
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                                      token.orderType === 'parcel'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    {token.orderType === 'parcel' ? '📦 Parcel' : '🍽️ Eat'}
                                  </span>
                                </div>
                                <button
                                  disabled={markingDoneIds[token.orderItemId]}
                                  onClick={() => markItemDone(token.orderItemId, token.orderId)}
                                  className="flex-shrink-0 bg-green-600 hover:bg-green-700 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 shadow-sm"
                                >
                                  {markingDoneIds[token.orderItemId] ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    '✓ Done'
                                  )}
                                </button>
                              </div>
                            ))}

                            {/* Done items (dimmed) */}
                            {doneTokens.length > 0 && pendingTokens.length > 0 && (
                              <div className="border-t border-dashed border-gray-200 pt-2 mt-2 space-y-1.5">
                                {doneTokens.map((token) => (
                                  <div
                                    key={token.orderItemId}
                                    className="flex items-center justify-between gap-2 bg-green-50/60 rounded-xl px-3 py-2 border border-green-100 opacity-60"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                                      <span className="text-sm font-medium text-gray-400 line-through">
                                        Token {token.tokenNumber} ×{token.quantity}
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded">
                                      SERVED
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-[#1A1A2E] text-white rounded-xl p-6 mb-6 text-center">
                    <p className="text-sm text-gray-400">No active items in queue</p>
                  </div>
                )}

                {/* ═══════════════════════════════════════
                    TOKEN MASTER CARDS — Vertical List
                    Full order details, FCFS order.
                    ═══════════════════════════════════════ */}
                <h3 className="text-base font-bold text-[#1A1A2E] mb-3 flex items-center gap-2">
                  Token Details
                  <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {activeOrders.length} active
                  </span>
                </h3>
                <div className="space-y-4">
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
