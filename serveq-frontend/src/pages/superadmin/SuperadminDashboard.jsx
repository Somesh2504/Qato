// src/pages/superadmin/SuperadminDashboard.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Crown,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  addSuperadmin,
  getSuperadminAdmins,
  getSuperadminRestaurants,
  removeSuperadmin,
} from '../../utils/api';
import Button from '../../components/ui/Button';
import toast from 'react-hot-toast';

const PLAN_COLORS = {
  Free: 'bg-gray-100 text-gray-700',
  'Inaugural Offer': 'bg-purple-100 text-purple-700',
};

function getDisplayPlan(plan) {
  if (!plan || plan === 'Free') return 'Free';
  return 'Inaugural Offer';
}

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const now = new Date();
  const end = new Date(dateStr);
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

export default function SuperadminDashboard() {
  const { logout, email: currentEmail } = useAuth();
  const navigate = useNavigate();

  const [restaurants, setRestaurants] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [tab, setTab] = useState('restaurants'); // 'restaurants' | 'admins'

  const fetchAll = useCallback(async () => {
    try {
      const [{ data: rData }, { data: aData }] = await Promise.all([
        getSuperadminRestaurants(),
        getSuperadminAdmins(),
      ]);
      setRestaurants(rData?.restaurants || []);
      setAdmins(aData?.admins || []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // ── Add Superadmin ──
  const handleAddAdmin = async () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Enter a valid email');
      return;
    }
    if (admins.some(a => a.email === email)) {
      toast.error('This email is already a superadmin');
      return;
    }
    setAddingAdmin(true);
    try {
      await addSuperadmin(email);
      toast.success(`Added ${email} as superadmin`);
      setNewAdminEmail('');
      await fetchAll();
    } catch (err) {
      toast.error(err.message || 'Failed to add admin');
    } finally {
      setAddingAdmin(false);
    }
  };

  // ── Remove Superadmin ──
  const handleRemoveAdmin = async (adminId, adminEmail) => {
    if (adminEmail === currentEmail) {
      toast.error("You can't remove yourself!");
      return;
    }
    if (!confirm(`Remove ${adminEmail} from superadmins?`)) return;
    try {
      await removeSuperadmin(adminId);
      toast.success(`Removed ${adminEmail}`);
      await fetchAll();
    } catch {
      toast.error('Failed to remove admin');
    }
  };

  // ── Filtered restaurants ──
  const filtered = useMemo(() => {
    if (!search.trim()) return restaurants;
    const q = search.toLowerCase();
    return restaurants.filter(
      r => (r.name || '').toLowerCase().includes(q) ||
           (r.owner_email || '').toLowerCase().includes(q) ||
           (r.slug || '').toLowerCase().includes(q)
    );
  }, [restaurants, search]);

  // ── Summary stats ──
  const stats = useMemo(() => {
    const total = restaurants.length;
    const expiring = restaurants.filter(r => {
      const d = daysUntil(r.subscription_end_date);
      return d <= 5 && d >= 0;
    }).length;
    const expired = restaurants.filter(r => daysUntil(r.subscription_end_date) < 0).length;
    const free = restaurants.filter(r => !r.subscription_plan || r.subscription_plan === 'Free').length;
    const offer = restaurants.filter(r => r.subscription_plan && r.subscription_plan !== 'Free').length;
    return { total, expiring, expired, free, offer };
  }, [restaurants]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#e04e1a] flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Crown size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ fontFamily: "'Outfit','Inter',sans-serif" }}>
                QRAVE Superadmin
              </h1>
              <p className="text-xs text-gray-500">{currentEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" loading={refreshing} onClick={handleRefresh}
              className="!border-gray-200 !text-gray-700 hover:!bg-gray-50">
              <RefreshCw size={14} />
              Refresh
            </Button>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors">
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Restaurants', value: stats.total, icon: Building2, color: 'text-[#FF6B35]' },
            { label: 'Free Plans', value: stats.free, icon: Users, color: 'text-gray-500' },
            { label: 'Inaugural Offer Plans', value: stats.offer, icon: Crown, color: 'text-purple-500' },
            { label: 'Expiring Soon', value: stats.expiring, icon: AlertTriangle, color: 'text-yellow-500' },
            { label: 'Expired', value: stats.expired, icon: XCircle, color: 'text-red-500' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <s.icon size={18} className={s.color} />
              <p className="text-2xl font-bold mt-2">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2">
          {['restaurants', 'admins'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-[#FF6B35] text-white shadow-lg shadow-orange-500/20'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {t === 'restaurants' ? (
                <span className="flex items-center gap-1.5"><Building2 size={14} /> Restaurants</span>
              ) : (
                <span className="flex items-center gap-1.5"><ShieldCheck size={14} /> Superadmins</span>
              )}
            </button>
          ))}
        </div>

        {/* ──────────────── RESTAURANTS TAB ──────────────── */}
        {tab === 'restaurants' && (
          <>
            {/* Search */}
            <div className="relative max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, or slug…"
                className="w-full h-11 rounded-xl bg-white border border-gray-200 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#FF6B35] transition-colors"
              />
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 text-left text-xs uppercase tracking-wider">
                      <th className="px-4 py-3">Restaurant</th>
                      <th className="px-4 py-3">Owner Email</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Ends On</th>
                      <th className="px-4 py-3">Days Left</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          No restaurants found.
                        </td>
                      </tr>
                    ) : filtered.map(r => {
                      const days = daysUntil(r.subscription_end_date);
                      const plan = r.subscription_plan || 'Free';
                      let statusLabel = 'Active';
                      let statusCls = 'bg-green-50 text-green-700 border border-green-200/60';
                      if (days < 0) {
                        statusLabel = 'Expired';
                        statusCls = 'bg-red-50 text-red-700 border border-red-200/60';
                      } else if (days <= 2) {
                        statusLabel = 'Critical';
                        statusCls = 'bg-red-100 text-red-700 border border-red-200/60 animate-pulse';
                      } else if (days <= 5) {
                        statusLabel = 'Expiring Soon';
                        statusCls = 'bg-yellow-50 text-yellow-700 border border-yellow-200/60';
                      }

                      return (
                        <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {r.logo_url ? (
                                <img src={r.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-[#FF6B35]/10 flex items-center justify-center text-[#FF6B35] font-bold text-xs">
                                  {(r.name || '?')[0].toUpperCase()}
                                </div>
                              )}
                              <div>
                                <p className="font-semibold text-gray-900">{r.name}</p>
                                <p className="text-xs text-gray-500">/{r.slug}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{r.owner_email}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${PLAN_COLORS[getDisplayPlan(plan)] || PLAN_COLORS.Free}`}>
                              {getDisplayPlan(plan)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {r.subscription_end_date
                              ? new Date(r.subscription_end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—'
                            }
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-bold ${days < 0 ? 'text-red-500' : days <= 2 ? 'text-red-500' : days <= 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusCls}`}>
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ──────────────── ADMINS TAB ──────────────── */}
        {tab === 'admins' && (
          <div className="space-y-4">
            {/* Add new admin */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Plus size={14} /> Add New Superadmin
              </h3>
              <div className="flex gap-2 max-w-md">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={e => setNewAdminEmail(e.target.value)}
                  placeholder="admin@email.com"
                  className="flex-1 h-11 rounded-xl bg-white border border-gray-200 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#FF6B35] transition-colors"
                  onKeyDown={e => e.key === 'Enter' && handleAddAdmin()}
                />
                <Button variant="primary" loading={addingAdmin} onClick={handleAddAdmin}>
                  <Plus size={14} /> Add
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Only existing superadmins can add new ones. Added admins will have full access to this panel.
              </p>
            </div>

            {/* Admin list */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900">Current Superadmins ({admins.length})</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {admins.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#e04e1a] flex items-center justify-center text-white font-bold text-xs">
                        {a.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{a.email}</p>
                        <p className="text-xs text-gray-500">
                          Added {new Date(a.created_at).toLocaleDateString('en-IN')}
                          {a.email === currentEmail && (
                            <span className="ml-1 text-[#FF6B35]">· You</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {a.email !== currentEmail && (
                      <button
                        onClick={() => handleRemoveAdmin(a.id, a.email)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
