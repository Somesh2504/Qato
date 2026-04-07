import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, MonitorPlay, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';

const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
};

export default function DisplayBoardPage() {
  const navigate = useNavigate();
  const { restaurantId, restaurantName } = useAuth();
  const supabaseRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [screenError, setScreenError] = useState('');
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(new Date());

  const fetchOrders = useCallback(async () => {
    if (!restaurantId || !supabaseRef.current) return;
    const { start, end } = getTodayRange();

    try {
      setScreenError('');
      const { data, error } = await supabaseRef.current
        .from('orders')
        .select('id, token_number, status, payment_type, payment_status, created_at')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setOrders(data || []);
    } catch {
      setScreenError('Unable to load display board right now.');
    }
  }, [restaurantId]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        supabaseRef.current = getSupabaseClient();
      } catch {
        if (mounted) {
          setScreenError('Unable to connect to live orders.');
          setLoading(false);
        }
        return;
      }

      await fetchOrders();
      if (mounted) setLoading(false);
    };

    init();

    return () => {
      mounted = false;
    };
  }, [fetchOrders]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!restaurantId || !supabaseRef.current) return;

    const channel = supabaseRef.current
      .channel(`display-board:${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => fetchOrders()
      )
      .subscribe();

    return () => {
      supabaseRef.current?.removeChannel(channel);
    };
  }, [restaurantId, fetchOrders]);

  const activeTokens = useMemo(() => {
    return (orders || [])
      .filter((order) => {
        if (order.payment_type === 'upi' && order.payment_status !== 'paid') return false;
        return ['pending', 'preparing', 'cancellation_requested'].includes(order.status);
      })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [orders]);

  return (
    <div className="min-h-screen bg-white text-[#1A1A2E] px-4 py-6 md:px-8 md:py-8">
      <header className="max-w-7xl mx-auto mb-6 md:mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm md:text-base font-extrabold uppercase tracking-[0.16em] text-[#FF6B35]">
            <MonitorPlay size={18} />
            Live Token Display
          </p>
          <h1 className="text-3xl md:text-5xl font-black mt-2 leading-tight">{restaurantName || 'Restaurant'} Queue</h1>
          <p className="text-base md:text-lg text-gray-500 mt-1">Tokens are shown in first-come-first-serve order.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<ArrowLeft size={14} />}
            onClick={() => navigate('/admin/orders')}
          >
            Live Orders
          </Button>
          <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-base md:text-lg font-bold text-[#1A1A2E]">
            <Clock3 size={16} className="text-[#FF6B35]" />
            {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {screenError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            {screenError}
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="h-28 md:h-32 rounded-2xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : activeTokens.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-gray-50 text-center px-6 py-14 md:py-20">
            <p className="text-xl md:text-2xl font-bold text-[#1A1A2E]">No Active Tokens</p>
            <p className="text-sm text-gray-500 mt-2">New tokens will appear here automatically.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-lg md:text-xl font-bold text-[#1A1A2E]">Now Serving Queue: {activeTokens.length} token{activeTokens.length > 1 ? 's' : ''}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              {activeTokens.map((order, index) => (
                <div
                  key={order.id}
                  className="rounded-2xl border border-[#262B46] bg-[#1A1F38] shadow-sm p-4 md:p-5 min-h-[130px] md:min-h-[160px] flex flex-col justify-between"
                >
                  <p className="text-xs md:text-sm uppercase tracking-[0.16em] font-semibold text-white/60">Queue #{index + 1}</p>
                  <p className="text-5xl md:text-6xl font-black text-[#FF6B35] leading-none">{order.token_number}</p>
                  <p className="text-sm md:text-base text-white/65 font-medium">Token</p>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
