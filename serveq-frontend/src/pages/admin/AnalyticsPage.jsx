import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronDown, Search } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AdminSidebar from '../../components/layout/AdminSidebar';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { formatIndianPrice } from '../../utils/helpers';
import toast from 'react-hot-toast';
import SkeletonCard from '../../components/ui/SkeletonCard';

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function AnalyticsPage() {
  const { restaurantId } = useAuth();
  const [rangeKey, setRangeKey] = useState('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [orders, setOrders] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [screenError, setScreenError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState([]);

  const getRangeBounds = () => {
    const now = new Date();
    if (rangeKey === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    if (rangeKey === 'week') {
      const currentDay = (now.getDay() + 6) % 7; // Monday=0
      const start = new Date(now);
      start.setDate(now.getDate() - currentDay);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (rangeKey === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    if (rangeKey === 'custom' && customStart && customEnd) {
      return {
        start: new Date(`${customStart}T00:00:00`),
        end: new Date(`${customEnd}T23:59:59`),
      };
    }
    const fallback = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { start: fallback, end: now };
  };

  useEffect(() => {
    setScreenError('');
    const fetchAll = async () => {
      if (!restaurantId) return;
      setLoading(true);
      try {
        const supabase = getSupabaseClient();
        const { start, end } = getRangeBounds();

        const [ordersRes, ratingsRes] = await Promise.all([
          supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('restaurant_id', restaurantId)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false }),
          supabase
            .from('ratings')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false }),
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (ratingsRes.error) throw ratingsRes.error;

        setOrders(ordersRes.data || []);
        setRatings(ratingsRes.data || []);
      } catch {
        setScreenError('We couldn’t load your analytics. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [restaurantId, rangeKey, customStart, customEnd, refreshTick]);

  const ratingsByOrderId = useMemo(() => {
    const map = new Map();
    for (const rating of ratings) map.set(rating.order_id, rating);
    return map;
  }, [ratings]);

  const doneOrders = useMemo(() => orders.filter((o) => o.status === 'done'), [orders]);
  const revenueOrders = useMemo(
    () => doneOrders.filter((o) => o.payment_status !== 'refunded'),
    [doneOrders]
  );

  const metrics = useMemo(() => {
    const totalOrders = doneOrders.length;
    const totalRevenue = revenueOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const averageOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

    const waitSamples = doneOrders
      .map((o) => {
        const start = new Date(o.created_at).getTime();
        const end = new Date(o.updated_at || o.created_at).getTime();
        if (!start || !end || end < start) return null;
        return (end - start) / 60000;
      })
      .filter((x) => x !== null);

    const averageWait = waitSamples.length
      ? waitSamples.reduce((s, n) => s + n, 0) / waitSamples.length
      : 0;

    return { totalOrders, totalRevenue, averageOrderValue, averageWait };
  }, [doneOrders, revenueOrders]);

  const paymentSplit = useMemo(() => {
    const cash = revenueOrders.filter((o) => o.payment_type === 'cash');
    const upi = revenueOrders.filter((o) => o.payment_type === 'upi');
    const cashCount = cash.length;
    const upiCount = upi.length;
    const cashTotal = cash.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const upiTotal = upi.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const total = cashCount + upiCount;
    const upiPct = total ? Math.round((upiCount / total) * 100) : 0;
    const cashPct = total ? 100 - upiPct : 0;
    return {
      cashCount,
      upiCount,
      cashTotal,
      upiTotal,
      chart: [
        { name: 'Cash', count: cashCount },
        { name: 'UPI', count: upiCount },
      ],
      label: `${upiPct}% UPI, ${cashPct}% Cash`,
    };
  }, [revenueOrders]);

  const heatmapData = useMemo(() => {
    const map = new Map();
    for (const day of DAYS) {
      for (const hr of HOURS) map.set(`${day}-${hr}`, 0);
    }
    for (const order of orders) {
      const d = new Date(order.created_at);
      const jsDay = d.getDay(); // 0 Sunday
      const monIndex = (jsDay + 6) % 7;
      const dayName = DAYS[monIndex];
      const hour = d.getHours();
      const key = `${dayName}-${hour}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    const max = Math.max(...Array.from(map.values()), 0);
    const rows = [];
    for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex++) {
      for (let hour = 0; hour < HOURS.length; hour++) {
        const key = `${DAYS[dayIndex]}-${hour}`;
        const value = map.get(key) || 0;
        rows.push({
          x: hour,
          y: dayIndex,
          z: value,
          day: DAYS[dayIndex],
          hourLabel: `${String(hour).padStart(2, '0')}:00`,
          fill:
            value === 0
              ? '#FFFFFF'
              : max <= 0
                ? '#FED7AA'
                : value > max * 0.66
                  ? '#EA580C'
                  : value > max * 0.33
                    ? '#FB923C'
                    : '#FED7AA',
        });
      }
    }
    return rows;
  }, [orders]);

  const topItems = useMemo(() => {
    const totalDone = doneOrders.length || 1;
    const agg = new Map();
    for (const order of doneOrders) {
      for (const item of order.order_items || []) {
        const key = item.item_name || 'Unknown Item';
        const prev = agg.get(key) || { name: key, count: 0, revenue: 0 };
        prev.count += Number(item.quantity || 0);
        prev.revenue += Number(item.item_price || item.price || 0) * Number(item.quantity || 0);
        agg.set(key, prev);
      }
    }
    return Array.from(agg.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((row, idx) => ({
        ...row,
        rank: idx + 1,
        pctOrders: Math.round((row.count / totalDone) * 100),
      }));
  }, [doneOrders]);

  const ratingSummary = useMemo(() => {
    const stars = ratings.map((r) => Number(r.stars || 0)).filter((s) => s >= 1 && s <= 5);
    const avg = stars.length ? stars.reduce((s, n) => s + n, 0) / stars.length : 0;
    const dist = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: stars.filter((s) => s === star).length,
    }));
    const recentComments = ratings
      .filter((r) => r.comment && r.comment.trim())
      .slice(0, 5);
    return { avg, dist, recentComments };
  }, [ratings]);

  const historyRows = useMemo(() => {
    return orders.filter((order) => {
      if (paymentFilter !== 'all' && order.payment_type !== paymentFilter) return false;
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (dateFilter) {
        const d = new Date(order.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`;
        if (key !== dateFilter) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const token = String(order.token_number || '').toLowerCase();
        const itemSummary = (order.order_items || [])
          .map((i) => i.item_name || '')
          .join(' ')
          .toLowerCase();
        if (!token.includes(q) && !itemSummary.includes(q)) return false;
      }
      return true;
    });
  }, [orders, paymentFilter, statusFilter, dateFilter, search]);

  const toggleExpanded = (id) => {
    setExpandedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FA]">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 md:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-[#1A1A2E]">Analytics</h1>
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRangeKey(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    rangeKey === opt.key
                      ? 'bg-white text-[#FF6B35] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {rangeKey === 'custom' && (
            <div className="flex items-center gap-2 mt-3">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm"
              />
              <span className="text-gray-500 text-sm">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm"
              />
            </div>
          )}
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {screenError ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm space-y-3">
              <div className="text-5xl">😕</div>
              <h2 className="text-lg font-bold text-[#1A1A2E]">We couldn’t load your analytics</h2>
              <p className="text-sm text-gray-500">Please check your connection and try again.</p>
              <Button variant="primary" onClick={() => setRefreshTick((t) => t + 1)}>
                Retry
              </Button>
            </div>
          ) : null}
          {!loading && metrics.totalOrders === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm">
              <div className="text-4xl">📈</div>
              <p className="mt-3 font-semibold text-[#1A1A2E]">
                Start taking orders to see your analytics here.
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {loading ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} variant="stat-card" />
                ))}
              </>
            ) : (
              <>
                {[
                  { label: 'Total Orders', value: metrics.totalOrders },
                  { label: 'Total Revenue ₹', value: formatIndianPrice(metrics.totalRevenue) },
                  { label: 'Average Order Value ₹', value: formatIndianPrice(metrics.averageOrderValue) },
                  { label: 'Average Wait Time', value: `${Math.round(metrics.averageWait)} mins` },
                ].map((card) => (
                  <div key={card.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs text-gray-500">{card.label}</p>
                    <p className="text-2xl font-bold text-[#1A1A2E] mt-2">{card.value}</p>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <h2 className="text-base font-semibold text-[#1A1A2E] mb-3">Payment Split</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={paymentSplit.chart} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" />
                  <Tooltip
                    formatter={(v) => [v, 'Orders']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 8, 8]}>
                    <Cell fill="#F59E0B" />
                    <Cell fill="#22C55E" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="text-sm text-gray-600 mt-2">{paymentSplit.label}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-500">Cash Orders</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{paymentSplit.cashCount}</p>
                <p className="text-sm text-gray-600 mt-1">{formatIndianPrice(paymentSplit.cashTotal)}</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-500">UPI Orders</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{paymentSplit.upiCount}</p>
                <p className="text-sm text-gray-600 mt-1">{formatIndianPrice(paymentSplit.upiTotal)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <h2 className="text-base font-semibold text-[#1A1A2E] mb-1">When your customers order most</h2>
            <p className="text-xs text-gray-500 mb-3">Peak Hour Heatmap</p>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, 23]}
                  ticks={[0, 4, 8, 12, 16, 20, 23]}
                  tickFormatter={(h) => `${h}:00`}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={[0, 6]}
                  ticks={[0, 1, 2, 3, 4, 5, 6]}
                  tickFormatter={(d) => DAYS[d]}
                  reversed
                />
                <Tooltip
                  formatter={(_, __, payload) => {
                    const d = payload?.payload;
                    if (!d) return ['0', 'Orders'];
                    return [`${d.z} orders at ${d.day} ${d.hourLabel}`, ''];
                  }}
                />
                <Scatter data={heatmapData} shape={(props) => {
                  const { cx, cy, payload } = props;
                  return <rect x={cx - 6} y={cy - 6} width={12} height={12} rx={2} fill={payload.fill} stroke="#F1F5F9" />;
                }} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <h2 className="text-base font-semibold text-[#1A1A2E] mb-3">Top Items</h2>
              {topItems.length === 0 ? (
                <p className="text-sm text-gray-500">No item data in selected period.</p>
              ) : (
                <div className="space-y-3">
                  {topItems.map((item) => (
                    <div key={item.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-[#1A1A2E]">#{item.rank} {item.name}</span>
                        <span className="text-gray-500">{item.count} qty</span>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-gray-500">{formatIndianPrice(item.revenue)}</span>
                        <span className="text-gray-500">{item.pctOrders}% of orders</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full mt-1">
                        <div className="h-2 bg-[#FF6B35] rounded-full" style={{ width: `${Math.min(100, item.pctOrders)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <h2 className="text-base font-semibold text-[#1A1A2E] mb-3">Ratings Summary</h2>
              <div className="flex items-end gap-3">
                <p className="text-4xl font-bold text-[#1A1A2E]">{ratingSummary.avg.toFixed(1)}</p>
                <p className="text-sm text-gray-500 mb-1">/ 5</p>
              </div>
              <div className="text-yellow-500 text-xl mt-1">
                {'★★★★★'.slice(0, Math.round(ratingSummary.avg)).padEnd(5, '☆')}
              </div>
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={ratingSummary.dist}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="star" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 max-h-28 overflow-y-auto space-y-2">
                {ratingSummary.recentComments.length === 0 ? (
                  <p className="text-xs text-gray-500">No comments yet.</p>
                ) : (
                  ratingSummary.recentComments.map((c) => (
                    <div key={c.id} className="text-xs bg-gray-50 border border-gray-100 rounded-xl p-2">
                      <p className="text-gray-700">{c.comment}</p>
                      <p className="text-gray-400 mt-1">{new Date(c.created_at).toLocaleString('en-IN')}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <h2 className="text-base font-semibold text-[#1A1A2E] mb-3">Order History</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search token/item"
                  className="h-10 w-full rounded-xl border border-gray-200 pl-8 pr-3 text-sm"
                />
              </div>
              <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-10 rounded-xl border border-gray-200 px-3 text-sm" />
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="h-10 rounded-xl border border-gray-200 px-3 text-sm">
                <option value="all">All Payments</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-xl border border-gray-200 px-3 text-sm">
                <option value="all">All Status</option>
                <option value="pending">pending</option>
                <option value="preparing">preparing</option>
                <option value="done">done</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-2">Token #</th>
                    <th className="py-2">Time</th>
                    <th className="py-2">Items</th>
                    <th className="py-2">Payment</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Rating</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((order) => {
                    const isExpanded = expandedOrderIds.includes(order.id);
                    const rating = ratingsByOrderId.get(order.id);
                    const shortItems = (order.order_items || []).slice(0, 2).map((i) => `${i.quantity}x ${i.item_name}`).join(', ');
                    return (
                      <>
                        <tr key={order.id} className="border-b border-gray-50">
                          <td className="py-2 font-semibold">#{order.token_number}</td>
                          <td className="py-2 text-gray-600">{new Date(order.created_at).toLocaleString('en-IN')}</td>
                          <td className="py-2 text-gray-700">{shortItems || '—'}</td>
                          <td className="py-2 capitalize">{order.payment_type}</td>
                          <td className="py-2">{formatIndianPrice(order.total_amount)}</td>
                          <td className="py-2 capitalize">{order.status}</td>
                          <td className="py-2">{rating?.stars ? `${rating.stars}★` : '—'}</td>
                          <td className="py-2 text-right">
                            <Button size="sm" variant="outline" onClick={() => toggleExpanded(order.id)} icon={<ChevronDown size={14} className={isExpanded ? 'rotate-180' : ''} />}>
                              {isExpanded ? 'Hide' : 'View'}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="pb-3">
                              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                <p className="text-xs text-gray-500 mb-2">Order details</p>
                                <div className="space-y-1 text-sm">
                                  {(order.order_items || []).map((item, idx) => (
                                    <div key={idx} className="flex justify-between">
                                      <span>{item.quantity}x {item.item_name}</span>
                                      <span>{formatIndianPrice((item.item_price || 0) * item.quantity)}</span>
                                    </div>
                                  ))}
                                </div>
                                {rating?.comment ? <p className="text-xs text-gray-600 mt-2">Comment: {rating.comment}</p> : null}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
              {historyRows.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No orders match the current filters.</p>
              ) : (
                <Legend />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
