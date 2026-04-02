import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoadingSpinner from './components/ui/LoadingSpinner';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import OfflineBanner from './components/ui/OfflineBanner';

// Pages
import LandingPage from './pages/LandingPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import SignupPage from './pages/onboarding/SignupPage';
import LoginPage from './pages/onboarding/LoginPage';
import AuthCallback from './pages/onboarding/AuthCallback';
import OrderQueuePage from './pages/admin/OrderQueuePage';
import MenuManagementPage from './pages/admin/MenuManagementPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import SettingsPage from './pages/admin/SettingsPage';
import MenuPage from './pages/customer/MenuPage';
import CheckoutPage from './pages/customer/CheckoutPage';
import PaymentResultPage from './pages/customer/PaymentResultPage';
import OrderStatusPage from './pages/customer/OrderStatusPage';

// Protected route wrapper
function Protected({ children }) {
  const { isLoggedIn, isLoading, restaurantId } = useAuth();
  if (isLoading) return <LoadingSpinner fullScreen text="Loading…" />;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!restaurantId) return <Navigate to="/signup" replace />;
  return children;
}

function SignupRoute() {
  const { isLoading, isLoggedIn, restaurantId } = useAuth();
  if (isLoading) return <LoadingSpinner fullScreen text="Loading…" />;
  if (isLoggedIn && restaurantId) return <Navigate to="/admin/orders" replace />;
  return <SignupPage />;
}

export default function App() {
  const isOnline = useOnlineStatus();

  return (
    <>
      {!isOnline ? <OfflineBanner onRetry={() => window.location.reload()} /> : null}
      <Routes>
        {/* Landing page */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />

        {/* Onboarding */}
        <Route path="/signup" element={<SignupRoute />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Customer (public) */}
        <Route path="/menu/:slug" element={<MenuPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/payment-result" element={<PaymentResultPage />} />
        <Route path="/order/:orderId" element={<OrderStatusPage />} />

        {/* Admin auth */}
        <Route path="/admin/login" element={<LoginPage />} />
        {/* Compatibility route required by production spec */}
        <Route path="/login" element={<LoginPage />} />

        {/* Admin (protected) */}
        <Route path="/admin" element={<Navigate to="/admin/orders" replace />} />
        <Route path="/admin/orders" element={<Protected><OrderQueuePage /></Protected>} />
        <Route path="/admin/menu" element={<Protected><MenuManagementPage /></Protected>} />
        <Route path="/admin/analytics" element={<Protected><AnalyticsPage /></Protected>} />
        <Route path="/admin/settings" element={<Protected><SettingsPage /></Protected>} />

        {/* 404 fallback */}
        <Route path="*" element={
          <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
            <div className="text-6xl">🍽️</div>
            <h1 className="text-2xl font-bold text-[#1A1A2E]">Page Not Found</h1>
            <p className="text-gray-500">The page you're looking for doesn't exist.</p>
            <a href="/" className="px-4 py-2 bg-[#FF6B35] text-white rounded-xl font-medium hover:bg-[#E55A24] transition-colors">
              Go Home
            </a>
          </div>
        } />
      </Routes>
    </>
  );
}
