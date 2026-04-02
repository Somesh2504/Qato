import { useState, useEffect } from 'react';
import { Save, Store, Globe, QrCode, Bell, Palette, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import AdminSidebar from '../../components/layout/AdminSidebar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { getRestaurantProfile, updateRestaurantProfile, updateRestaurantSettings } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { generateSlug } from '../../utils/helpers';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'profile', label: 'Profile', icon: Store },
  { key: 'qr',      label: 'QR Codes', icon: QrCode },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

export default function SettingsPage() {
  const { restaurantSlug, restaurantName, updateRestaurantInfo } = useAuth();
  const [tab, setTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState({
    name: '', slug: '', description: '', address: '', phone: '',
    cuisine_type: '', opening_time: '09:00', closing_time: '22:00',
    upi_id: '', accepts_cash: true, tax_percentage: 0,
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data } = await getRestaurantProfile();
      setProfile((p) => ({ ...p, ...data }));
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateRestaurantProfile(profile);
      updateRestaurantInfo({ name: profile.name, slug: profile.slug });
      toast.success('Profile saved!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const menuUrl = `${window.location.origin}/menu/${profile.slug || restaurantSlug || 'your-slug'}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(menuUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35]/20 transition-all';

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4">
          <h1 className="text-xl font-bold text-[#1A1A2E]">Settings</h1>
          <div className="flex items-center gap-1 mt-3">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === key ? 'bg-[#FF6B35] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 max-w-2xl">
          {/* Profile Tab */}
          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <Card>
                <h2 className="font-semibold text-[#1A1A2E] mb-4 flex items-center gap-2">
                  <Store size={17} className="text-[#FF6B35]" /> Restaurant Info
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Restaurant Name</label>
                    <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value, slug: generateSlug(e.target.value) }))}
                      placeholder="Paradise Biryani House" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Menu Slug</label>
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#FF6B35] transition-all">
                      <span className="px-3 py-2.5 bg-gray-50 text-gray-400 text-sm border-r border-gray-200 whitespace-nowrap">serveq.app/menu/</span>
                      <input value={profile.slug} onChange={e => setProfile(p => ({ ...p, slug: e.target.value }))}
                        placeholder="your-restaurant" className="flex-1 px-3 py-2.5 text-sm focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                    <textarea value={profile.description} onChange={e => setProfile(p => ({ ...p, description: e.target.value }))}
                      rows={2} placeholder="Short description of your restaurant…" className={`${inputCls} resize-none`} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                      <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Cuisine Type</label>
                      <input value={profile.cuisine_type} onChange={e => setProfile(p => ({ ...p, cuisine_type: e.target.value }))} placeholder="North Indian, Chinese…" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                    <textarea value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                      rows={2} placeholder="Full address…" className={`${inputCls} resize-none`} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Opening Time</label>
                      <input type="time" value={profile.opening_time} onChange={e => setProfile(p => ({ ...p, opening_time: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Closing Time</label>
                      <input type="time" value={profile.closing_time} onChange={e => setProfile(p => ({ ...p, closing_time: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <h2 className="font-semibold text-[#1A1A2E] mb-4 flex items-center gap-2">
                  <Globe size={17} className="text-[#FF6B35]" /> Payment Settings
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">UPI ID</label>
                    <input value={profile.upi_id} onChange={e => setProfile(p => ({ ...p, upi_id: e.target.value }))} placeholder="restaurant@upi" className={inputCls} />
                  </div>
                  <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl">
                    <span className="text-sm font-medium text-gray-700">Accept Cash Payments</span>
                    <button type="button" onClick={() => setProfile(p => ({ ...p, accepts_cash: !p.accepts_cash }))}
                      className={`w-11 h-6 rounded-full transition-colors relative ${profile.accepts_cash ? 'bg-[#FF6B35]' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${profile.accepts_cash ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Tax Percentage (%)</label>
                    <input type="number" min="0" max="30" value={profile.tax_percentage}
                      onChange={e => setProfile(p => ({ ...p, tax_percentage: e.target.value }))} placeholder="5" className={inputCls} />
                  </div>
                </div>
              </Card>

              <Button type="submit" variant="primary" size="lg" loading={saving} icon={<Save size={16} />}>
                Save Changes
              </Button>
            </form>
          )}

          {/* QR Tab */}
          {tab === 'qr' && (
            <div className="space-y-5">
              <Card className="text-center">
                <h2 className="font-semibold text-[#1A1A2E] mb-2">Your Menu QR Code</h2>
                <p className="text-sm text-gray-500 mb-6">Customers scan this to place orders from their phone</p>
                <div className="flex justify-center mb-6">
                  <div className="p-5 border-2 border-gray-100 rounded-2xl inline-block shadow-sm">
                    <QRCodeSVG
                      value={menuUrl}
                      size={200}
                      fgColor="#1A1A2E"
                      bgColor="white"
                      level="H"
                      imageSettings={{
                        src: '',
                        height: 36,
                        width: 36,
                        excavate: true,
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl mb-4 max-w-sm mx-auto">
                  <span className="flex-1 text-sm text-gray-600 truncate text-left">{menuUrl}</span>
                  <button onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium hover:border-[#FF6B35] hover:text-[#FF6B35] transition-all">
                    {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="flex gap-3 justify-center">
                  <Button variant="primary" size="md" onClick={() => window.print()}>
                    Download / Print
                  </Button>
                  <Button variant="outline" size="md" onClick={() => window.open(menuUrl, '_blank')}>
                    Preview Menu
                  </Button>
                </div>
              </Card>

              <Card>
                <h3 className="font-semibold text-[#1A1A2E] mb-3">Table-wise QR Codes</h3>
                <p className="text-sm text-gray-500 mb-4">Generate unique QR codes per table to track which table ordered.</p>
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((table) => (
                    <button key={table}
                      className="aspect-square flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200 rounded-xl hover:border-[#FF6B35] hover:text-[#FF6B35] text-gray-400 transition-all group"
                      onClick={() => toast.success(`QR for Table ${table} — coming soon`)}>
                      <QrCode size={20} className="group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium">Table {table}</span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* Notifications Tab */}
          {tab === 'notifications' && (
            <Card>
              <h2 className="font-semibold text-[#1A1A2E] mb-4 flex items-center gap-2">
                <Bell size={17} className="text-[#FF6B35]" /> Notification Preferences
              </h2>
              <div className="space-y-4">
                {[
                  { key: 'new_order', label: 'New Order Alert', desc: 'Play sound and show notification when a new order arrives' },
                  { key: 'order_cancelled', label: 'Order Cancelled', desc: 'Notify when a customer cancels an order' },
                  { key: 'daily_summary', label: 'Daily Summary', desc: 'Get a daily summary of orders and revenue' },
                  { key: 'low_items', label: 'Item Unavailability Alerts', desc: 'Remind to mark items as unavailable when sold out' },
                ].map((pref) => (
                  <div key={pref.key} className="flex items-start justify-between gap-4 p-3 border border-gray-200 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{pref.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{pref.desc}</p>
                    </div>
                    <button className="w-11 h-6 rounded-full bg-[#FF6B35] relative flex-shrink-0 mt-0.5">
                      <span className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full shadow" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="primary" size="md" className="mt-5" icon={<Save size={15} />}>
                Save Preferences
              </Button>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
