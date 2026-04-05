import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoadingSpinner from './components/ui/LoadingSpinner';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import OfflineBanner from './components/ui/OfflineBanner';

// Lazy-loaded Pages (Code Splitting)
const LandingPage = lazy(() => import('./pages/LandingPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const SignupPage = lazy(() => import('./pages/onboarding/SignupPage'));
const LoginPage = lazy(() => import('./pages/onboarding/LoginPage'));
const AuthCallback = lazy(() => import('./pages/onboarding/AuthCallback'));
const OrderQueuePage = lazy(() => import('./pages/admin/OrderQueuePage'));
const MenuManagementPage = lazy(() => import('./pages/admin/MenuManagementPage'));
const AnalyticsPage = lazy(() => import('./pages/admin/AnalyticsPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const MenuPage = lazy(() => import('./pages/customer/MenuPage'));
const CheckoutPage = lazy(() => import('./pages/customer/CheckoutPage'));
const PaymentResultPage = lazy(() => import('./pages/customer/PaymentResultPage'));
const OrderStatusPage = lazy(() => import('./pages/customer/OrderStatusPage'));
const SuperadminDashboard = lazy(() => import('./pages/superadmin/SuperadminDashboard'));
const SuperadminLoginPage = lazy(() => import('./pages/superadmin/SuperadminLoginPage'));

// Protected route wrapper (Restaurant Admin)
function Protected({ children }) {
  const { isLoggedIn, isLoading, restaurantId } = useAuth();
  if (isLoading) return <LoadingSpinner fullScreen text="Loading…" />;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!restaurantId) return <Navigate to="/signup" replace />;
  return children;
}

// Superadmin protected route wrapper — checks sessionStorage flag from /superadmin/login
function SuperadminProtected({ children }) {
  const isSuperadmin = sessionStorage.getItem('qato_superadmin') === 'true';
  if (!isSuperadmin) return <Navigate to="/superadmin/login" replace />;
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
      <Suspense fallback={<LoadingSpinner fullScreen text="Loading..." />}>
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

          {/* Superadmin (protected — only verified superadmins) */}
          <Route path="/superadmin/login" element={<SuperadminLoginPage />} />
          <Route path="/superadmin" element={<Navigate to="/superadmin/dashboard" replace />} />
          <Route path="/superadmin/dashboard" element={<SuperadminProtected><SuperadminDashboard /></SuperadminProtected>} />

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
      </Suspense>
    </>
  );
}
