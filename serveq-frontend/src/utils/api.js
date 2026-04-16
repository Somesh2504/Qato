import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Request interceptor — attach token automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('serveq_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('serveq_token');
      localStorage.removeItem('serveq_restaurant');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────
export const loginAdmin = (email, password) =>
  api.post('/auth/login', { email, password });

export const signupRestaurant = (data) =>
  api.post('/auth/signup', data);

export const logoutAdmin = () =>
  api.post('/auth/logout');

export const getMe = () =>
  api.get('/auth/me');

// ─── Restaurant ──────────────────────────────────────────
export const getRestaurantProfile = () =>
  api.get('/restaurant/profile');

export const updateRestaurantProfile = (data) =>
  api.put('/restaurant/profile', data);

export const updateRestaurantSettings = (data) =>
  api.put('/restaurant/settings', data);

export const getRestaurantBySlug = (slug) =>
  api.get(`/restaurant/${slug}`);

// ─── Menu ────────────────────────────────────────────────
export const getMenu = (slug) =>
  api.get(`/menu/${slug}`);

export const getMenuAdmin = () =>
  api.get('/menu');

export const createMenuItem = (data) =>
  api.post('/menu/item', data);

export const updateMenuItem = (id, data) =>
  api.put(`/menu/item/${id}`, data);

export const deleteMenuItem = (id) =>
  api.delete(`/menu/item/${id}`);

export const toggleMenuItemAvailability = (id, available) =>
  api.patch(`/menu/item/${id}/availability`, { available });

export const createCategory = (data) =>
  api.post('/menu/category', data);

export const updateCategory = (id, data) =>
  api.put(`/menu/category/${id}`, data);

export const deleteCategory = (id) =>
  api.delete(`/menu/category/${id}`);

// ─── Orders ──────────────────────────────────────────────
export const placeOrder = (data) =>
  api.post('/orders', data);

export const getOrderStatus = (orderId) =>
  api.get(`/orders/${orderId}/status`);

export const getOrders = (params) =>
  api.get('/orders', { params });

export const updateOrderStatus = (orderId, status) =>
  api.patch(`/orders/${orderId}/status`, { status });

export const getOrderById = (orderId) =>
  api.get(`/orders/${orderId}`);

// ─── Payments ────────────────────────────────────────────
export const initiatePayment = (data) =>
  api.post('/payments/initiate', data);

export const verifyPayment = (data) =>
  api.post('/payments/verify', data);

export const getPaymentStatus = (orderId) =>
  api.get(`/payments/${orderId}/status`);

// ─── Analytics ───────────────────────────────────────────
export const getAnalyticsOverview = (params) =>
  api.get('/analytics/overview', { params });

export const getRevenueChart = (params) =>
  api.get('/analytics/revenue', { params });

export const getTopItems = (params) =>
  api.get('/analytics/top-items', { params });

export const getOrdersChart = (params) =>
  api.get('/analytics/orders', { params });

// ─── QR ──────────────────────────────────────────────────
export const generateQRCode = (tableNumber) =>
  api.post('/qr/generate', { tableNumber });

export const getQRCodes = () =>
  api.get('/qr');

// ─── Superadmin ──────────────────────────────────────────
export const getSuperadminMe = () =>
  api.get('/superadmin/me');

export const getSuperadminRestaurants = () =>
  api.get('/superadmin/restaurants');

export const getSuperadminAdmins = () =>
  api.get('/superadmin/admins');

export const addSuperadmin = (email) =>
  api.post('/superadmin/admins', { email });

export const removeSuperadmin = (id) =>
  api.delete(`/superadmin/admins/${id}`);

export default api;
