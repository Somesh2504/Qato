import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  UtensilsCrossed,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/admin/orders',    icon: LayoutGrid,      label: 'Orders' },
  { to: '/admin/menu',      icon: UtensilsCrossed, label: 'Menu' },
  { to: '/admin/analytics', icon: BarChart3,        label: 'Analytics' },
  { to: '/admin/settings',  icon: Settings,         label: 'Settings' },
];

export default function AdminSidebar() {
  const { restaurantName, email, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const updateCollapsedForViewport = () => {
      setCollapsed(window.innerWidth < 1280);
    };
    updateCollapsedForViewport();
    window.addEventListener('resize', updateCollapsedForViewport);
    return () => window.removeEventListener('resize', updateCollapsedForViewport);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={[
        'flex flex-col bg-[#1A1A2E] text-white transition-all duration-300 ease-out flex-shrink-0',
        'h-screen sticky top-0',
        collapsed ? 'w-[72px]' : 'w-[240px]',
      ].join(' ')}
    >
      {/* Logo */}
      <div className={[
        'flex items-center border-b border-white/10 flex-shrink-0',
        collapsed ? 'justify-center px-0 py-5' : 'px-5 py-5 gap-2.5',
      ].join(' ')}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#FF6B35] flex-shrink-0">
          <Zap size={18} className="text-white" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight" style={{fontFamily:"'Outfit','Inter',sans-serif"}}>QATO</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems.map(({ to, icon, label }) => {
          const NavIcon = icon;
          return (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => [
              'flex items-center rounded-xl transition-all duration-150 group relative',
              collapsed ? 'justify-center px-0 py-3 mx-0' : 'gap-3 px-3 py-2.5',
              isActive
                ? 'bg-white/10 text-white'
                : 'text-white/60 hover:bg-white/8 hover:text-white',
            ].filter(Boolean).join(' ')}
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-[#FF6B35]" />
                )}
                <NavIcon
                  size={20}
                  className={[
                    'flex-shrink-0 transition-colors',
                    isActive ? 'text-[#FF6B35]' : 'text-white/60 group-hover:text-white',
                  ].join(' ')}
                />
                {!collapsed && (
                  <span className="text-sm font-medium">{label}</span>
                )}
                {/* Tooltip when collapsed */}
                {collapsed && (
                  <span className="
                    absolute left-full ml-3 px-2.5 py-1.5 bg-[#16213E] text-white text-xs
                    font-medium rounded-lg shadow-lg opacity-0 group-hover:opacity-100
                    pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50
                  ">
                    {label}
                  </span>
                )}
              </>
            )}
          </NavLink>
          );
        })}
      </nav>

      {/* Bottom: Restaurant info + Logout */}
      <div className="border-t border-white/10 p-3 flex-shrink-0 space-y-1">
        {/* Collapse toggle — hidden on small screens */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2 rounded-xl
            text-white/50 hover:text-white hover:bg-white/8 transition-colors text-xs font-medium"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : (
            <>
              <ChevronLeft size={16} />
              <span>Collapse</span>
            </>
          )}
        </button>

        {/* Restaurant info */}
        {!collapsed && (
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-white truncate leading-tight">
              {restaurantName || 'My Restaurant'}
            </p>
            <p className="text-xs text-white/40 truncate mt-0.5">{email || ''}</p>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={[
            'flex items-center w-full rounded-xl py-2.5 text-white/50',
            'hover:text-red-400 hover:bg-red-500/10 transition-colors group',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3',
          ].join(' ')}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
          {collapsed && (
            <span className="
              absolute left-full ml-3 px-2.5 py-1.5 bg-[#16213E] text-white text-xs
              font-medium rounded-lg shadow-lg opacity-0 group-hover:opacity-100
              pointer-events-none transition-opacity whitespace-nowrap z-50
            ">
              Logout
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
