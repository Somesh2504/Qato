import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, ChefHat, Clock, Home, RefreshCw, Star, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { formatIndianPrice, timeAgo } from '../../utils/helpers';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import toast from 'react-hot-toast';
import SkeletonCard from '../../components/ui/SkeletonCard';
import { useSeoForCustomer } from '../../hooks/useSeoForCustomer';

export default function OrderStatusPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [order, setOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [queueAhead, setQueueAhead] = useState(0);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);

  // Animated status pill
  const [statusAnimKey, setStatusAnimKey] = useState(0);
  const prevStatusRef = useRef(null);

  // Confetti + rating sheet
  const confettiFiredRef = useRef(false);
  const ratingOpenedRef = useRef(false);
  const ratingSubmittedRef = useRef(false);
  const ratingTimerRef = useRef(null);

  // Queue recalculation base for realtime callbacks
  const queueBaseRef = useRef({ restaurantId: null, createdAt: null });

  // Rating UI
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  const statusMeta = useMemo(() => {
    const s = order?.status;
    const map = {
      pending: {
        emoji: '🟡',
        label: 'Order Received',
        bg: 'bg-yellow-50',
        text: 'text-yellow-800',
        border: 'border-yellow-200',
        iconBg: 'bg-yellow-100',
        animation: '',
      },
      preparing: {
        emoji: '🔵',
        label: 'Preparing Your Order',
        bg: 'bg-blue-50',
        text: 'text-blue-800',
        border: 'border-blue-200',
        iconBg: 'bg-blue-100',
        animation: 'animate-pulse',
      },
      done: {
        emoji: '🟢',
        label: 'Ready for Pickup!',
        bg: 'bg-green-50',
        text: 'text-green-800',
        border: 'border-green-200',
        iconBg: 'bg-green-100',
        animation: '',
      },
      cancelled: {
        emoji: '🔴',
        label: 'Order Cancelled',
        bg: 'bg-red-50',
        text: 'text-red-800',
        border: 'border-red-200',
        iconBg: 'bg-red-100',
        animation: '',
      },
    };

    return map[s] || map.pending;
  }, [order?.status]);

  const paymentTypeLabel = useMemo(() => {
    if (!order?.payment_type) return '—';
    return order.payment_type === 'upi' ? 'UPI' : order.payment_type === 'cash' ? 'Cash' : order.payment_type;
  }, [order?.payment_type]);

  const recalcQueueAhead = async () => {
    if (!supabase) return;
    const { restaurantId, createdAt } = queueBaseRef.current;
    if (!restaurantId || !createdAt) return;

    const { count, error: countError } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .in('status', ['pending', 'preparing'])
      .lt('created_at', createdAt);

    if (countError) return;
    setQueueAhead(count || 0);
  };

  const fetchOrderDetails = async () => {
    if (!supabase) {
      setLoading(false);
      setError('We couldn’t load your order right now. Please try again.');
      return;
    }

    setLoading(true);
    setError('');
    setManualRefreshing(true);
    try {
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single();

      if (orderErr || !orderData) throw new Error(orderErr?.message || 'Order not found');

      const { data: restData, error: restErr } = await supabase
        .from('restaurants')
        .select('name,address,logo_url')
        .eq('id', orderData.restaurant_id)
        .single();

      if (restErr) {
        // Non-blocking: order itself should still render.
        setRestaurant(null);
      } else {
        setRestaurant(restData);
      }

      const items = orderData.order_items || [];
      setOrder(orderData);
      setOrderItems(items);

      queueBaseRef.current = {
        restaurantId: orderData.restaurant_id,
        createdAt: orderData.created_at,
      };

      await recalcQueueAhead();
    } catch (e) {
      setError('We couldn’t load your order. Please check your connection and try again.');
    } finally {
      setLoading(false);
      setManualRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (!orderId) return;
    fetchOrderDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, supabase]);

  // Subscribe to realtime order changes (status + estimated_wait_minutes)
  useEffect(() => {
    if (!supabase || !orderId) return;

    let orderChannel = null;
    try {
      orderChannel = supabase
        .channel(`order-row:${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${orderId}`,
          },
          (payload) => {
            const updated = payload.new;
            if (!updated) return;

            setOrder((prev) => ({ ...prev, ...updated }));

            const prevStatus = prevStatusRef.current;
            const nextStatus = updated.status;
            if (prevStatus && prevStatus !== nextStatus) {
              setStatusAnimKey((k) => k + 1);
            }

            if (prevStatus !== nextStatus && nextStatus === 'done' && !confettiFiredRef.current) {
              confettiFiredRef.current = true;
              confetti({
                particleCount: 180,
                spread: 90,
                origin: { y: 0.6 },
                colors: ['#FF6B35', '#1A1A2E', '#22C55E', '#F59E0B'],
              });
            }

            prevStatusRef.current = nextStatus;
          }
        )
        .subscribe();
    } catch {
      // noop
    }

    return () => {
      if (orderChannel) supabase.removeChannel(orderChannel);
    };
  }, [orderId, supabase]);

  // Subscribe to any pending/preparing changes in the restaurant, then recalc orders ahead.
  useEffect(() => {
    if (!supabase || !queueBaseRef.current.restaurantId) return;

    const restaurantId = queueBaseRef.current.restaurantId;
    let timer = null;

    const restaurantChannel = supabase
      .channel(`order-queue:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            recalcQueueAhead();
          }, 400);
        }
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(restaurantChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, order?.restaurant_id]);

  // POST-ORDER RATING sheet: open 3 seconds after status becomes done.
  useEffect(() => {
    if (!order?.status) return;
    if (!supabase) return;
    if (order.status !== 'done') return;
    if (ratingOpenedRef.current || ratingSubmittedRef.current) return;

    if (ratingTimerRef.current) clearTimeout(ratingTimerRef.current);
    ratingTimerRef.current = setTimeout(() => {
      ratingOpenedRef.current = true;
      setRatingOpen(true);
    }, 3000);

    return () => {
      if (ratingTimerRef.current) clearTimeout(ratingTimerRef.current);
    };
  }, [order?.status, supabase]);

  const statusPillKey = useMemo(() => `${order?.status || 'pending'}:${statusAnimKey}`, [order?.status, statusAnimKey]);

  const estimatedWaitText = useMemo(() => {
    const v = order?.estimated_wait_minutes;
    if (v === null || v === undefined) return 'About — minutes';
    return `About ${v} minutes`;
  }, [order?.estimated_wait_minutes]);

  const queueLabel = useMemo(() => {
    return queueAhead === 1 ? '1 order ahead of you' : `${queueAhead} orders ahead of you`;
  }, [queueAhead]);

  useSeoForCustomer({
    title: restaurant?.name ? `${restaurant.name} — Order Online | ServeQ` : 'ServeQ — Order Online',
    description: restaurant?.name ? `Track your order from ${restaurant.name} on ServeQ.` : undefined,
    ogImageUrl: restaurant?.logo_url || undefined,
  });

  const onSubmitRating = async () => {
    if (!supabase) return;
    if (!order?.id || !order?.restaurant_id) return;
    if (ratingStars < 1) return;

    setRatingSubmitting(true);
    try {
      const { error: insertErr } = await supabase.from('ratings').insert({
        order_id: order.id,
        restaurant_id: order.restaurant_id,
        stars: ratingStars,
        comment: ratingComment || null,
      });
      if (insertErr) throw insertErr;

      ratingSubmittedRef.current = true;
      setRatingOpen(false);
      setRatingStars(0);
      setRatingComment('');
      toast.success('Thanks for your rating!');
    } catch (e) {
      toast.error(e?.message || 'Failed to submit rating. Please try again.');
    } finally {
      setRatingSubmitting(false);
    }
  };

  // Guard: if supabase failed to configure, we still render a useful error screen.
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] p-4 md:p-6 space-y-4">
        <div className="bg-gradient-to-br from-[#1A1A2E] to-[#16213E] rounded-3xl p-5">
          <div className="skeleton h-8 w-56 rounded mb-3" />
          <div className="skeleton h-10 w-72 rounded-full" />
        </div>
        <SkeletonCard variant="order-card" />
        <div className="space-y-3">
          <SkeletonCard variant="order-card" />
          <SkeletonCard variant="order-card" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6 gap-4 text-center">
        <div className="text-5xl">😕</div>
        <h2 className="text-xl font-bold text-[#1A1A2E]">We couldn’t load your order</h2>
        <p className="text-sm text-gray-500">Please check your connection and try again.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="primary" onClick={fetchOrderDetails}>
            Retry
          </Button>
          <Button variant="outline" onClick={() => navigate('/')}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const orderStatus = order?.status;
  const disclaimerText = 'Estimated time set by restaurant. May vary.';

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-6">
      {/* TOP SECTION */}
      <div className="px-4 pt-7 pb-6 text-center bg-gradient-to-br from-[#1A1A2E] to-[#16213E]">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Token #{order?.token_number}
        </h1>

        <div className="mt-4 flex justify-center">
          <div
            key={statusPillKey}
            className={[
              'inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-all',
              statusMeta.bg,
              statusMeta.text,
              statusMeta.border,
            ].join(' ')}
          >
            <span className={`w-7 h-7 rounded-full flex items-center justify-center ${statusMeta.iconBg}`}>
              {orderStatus === 'preparing' ? (
                <ChefHat size={14} className="text-current animate-pulse" />
              ) : (
                <span>{statusMeta.emoji}</span>
              )}
            </span>
            <span className={statusMeta.animation}>{statusMeta.label}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 text-white/70 text-xs">
          <Clock size={12} />
          Placed {timeAgo(order?.created_at)}
        </div>
      </div>

      {/* MIDDLE SECTION */}
      <div className="px-4 pt-4 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#1A1A2E]">{queueLabel}</h2>
              <p className="text-sm text-gray-500 mt-1">{estimatedWaitText}</p>
              <p className="text-xs text-gray-400 mt-1">{disclaimerText}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={fetchOrderDetails}
              loading={manualRefreshing}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* BOTTOM SECTION */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setSummaryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-[#FF6B35] font-bold">
                🧾
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-[#1A1A2E]">Order Summary</p>
                <p className="text-xs text-gray-400">Payment: {paymentTypeLabel}</p>
              </div>
            </div>
            <div className="text-xs text-gray-500">{summaryOpen ? 'Hide' : 'Show'}</div>
          </button>

          {summaryOpen && (
            <div className="px-4 pb-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  {orderItems.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">
                          {item.quantity}× {item.item_name || item.name || item.menu_item?.name}
                        </p>
                        {item.customization_note ? (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-lg mt-1 inline-flex">
                            📝 {item.customization_note}
                          </p>
                        ) : null}
                      </div>
                      <p className="text-sm font-bold text-[#FF6B35] shrink-0">
                        {formatIndianPrice((item.item_price ?? item.price ?? item.unit_price) * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="h-px bg-gray-100 my-1" />

                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#1A1A2E]">Total</p>
                  <p className="text-lg font-extrabold text-[#FF6B35]">
                    {formatIndianPrice(order?.total_amount)}
                  </p>
                </div>

                <div className="mt-2 p-3 rounded-2xl bg-[#F8F9FA] border border-gray-100">
                  <p className="text-xs text-gray-500">Restaurant</p>
                  <p className="text-sm font-bold text-[#1A1A2E] mt-1">{restaurant?.name || '—'}</p>
                  <p className="text-xs text-gray-400 mt-1">{restaurant?.address || ''}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" fullWidth icon={<Home size={16} />} onClick={() => navigate('/')}>
            Order More
          </Button>
          <Button variant="primary" fullWidth onClick={fetchOrderDetails} icon={<RefreshCw size={16} />}>
            Refresh Status
          </Button>
        </div>

        {orderStatus === 'cancelled' ? (
          <div className="flex items-start gap-2 text-red-600 bg-red-50 border border-red-100 rounded-2xl p-3">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <p className="text-sm font-semibold">Order Cancelled</p>
          </div>
        ) : null}
      </div>

      {/* POST-ORDER RATING BOTTOM SHEET */}
      <BottomSheet isOpen={ratingOpen} onClose={() => setRatingOpen(false)} title="How was your experience?">
        <div className="p-4">
          <p className="text-sm text-gray-600">Select a rating (tap to choose)</p>
          <div className="flex gap-2 mt-3">
            {Array.from({ length: 5 }).map((_, idx) => {
              const val = idx + 1;
              const filled = val <= ratingStars;
              return (
                <button
                  key={val}
                  onClick={() => setRatingStars(val)}
                  className="w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center"
                  aria-label={`${val} star`}
                >
                  <Star size={20} className={filled ? 'text-[#FF6B35]' : 'text-gray-300'} fill={filled ? '#FF6B35' : 'transparent'} />
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <label className="text-xs text-gray-500 mb-1 block">Optional comment</label>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              rows={4}
              placeholder="Tell us what went well…"
              className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#FF6B35] resize-none transition-all"
            />
          </div>

          <div className="flex gap-3 mt-4">
            <Button variant="outline" fullWidth onClick={() => setRatingOpen(false)} loading={ratingSubmitting}>
              Skip
            </Button>
            <Button
              variant="primary"
              fullWidth
              loading={ratingSubmitting}
              onClick={async () => {
                if (ratingStars < 1) return;
                await onSubmitRating();
              }}
            >
              Submit
            </Button>
          </div>

          {ratingStars < 1 ? (
            <div className="mt-3 text-xs text-gray-400 flex items-start gap-2">
              <X size={14} className="text-gray-300 mt-0.5" />
              Please select at least 1 star.
            </div>
          ) : null}
        </div>
      </BottomSheet>
    </div>
  );
}
