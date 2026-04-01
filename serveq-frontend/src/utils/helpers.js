/**
 * Format a number as Indian Rupees with Indian number formatting
 * e.g. 124500 → "₹1,24,500"
 */
export const formatIndianPrice = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '₹0';
  const num = Number(amount);
  return '₹' + num.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
  });
};

/**
 * Returns relative time string
 * e.g. "5 mins ago", "2 hours ago", "just now"
 */
export const timeAgo = (date) => {
  if (!date) return '';
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec} secs ago`;
  if (diffMin < 60) return diffMin === 1 ? '1 min ago' : `${diffMin} mins ago`;
  if (diffHr < 24) return diffHr === 1 ? '1 hour ago' : `${diffHr} hours ago`;
  if (diffDay < 7) return diffDay === 1 ? 'Yesterday' : `${diffDay} days ago`;
  return past.toLocaleDateString('en-IN');
};

/**
 * Convert a name to a URL-friendly slug
 * e.g. "Biryani Palace" → "biryani-palace"
 */
export const generateSlug = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Format minutes into human-readable time estimate
 * e.g. 10 → "~10 mins", 90 → "~1 hr 30 mins"
 */
export const formatTime = (minutes) => {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `~${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `~${hrs} hr`;
  return `~${hrs} hr ${mins} mins`;
};

/**
 * Truncate text to a given length with ellipsis
 */
export const truncate = (text, length = 80) => {
  if (!text) return '';
  return text.length > length ? text.slice(0, length) + '…' : text;
};

/**
 * Capitalize first letter of each word
 */
export const titleCase = (str) => {
  if (!str) return '';
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
};

/**
 * Get order status display info
 */
export const getOrderStatusInfo = (status) => {
  const map = {
    pending:    { label: 'Pending',    color: '#F59E0B', bg: '#FEF3C7' },
    confirmed:  { label: 'Confirmed',  color: '#3B82F6', bg: '#DBEAFE' },
    preparing:  { label: 'Preparing',  color: '#8B5CF6', bg: '#EDE9FE' },
    ready:      { label: 'Ready',      color: '#22C55E', bg: '#DCFCE7' },
    delivered:  { label: 'Delivered',  color: '#6B7280', bg: '#F3F4F6' },
    cancelled:  { label: 'Cancelled',  color: '#EF4444', bg: '#FEE2E2' },
  };
  return map[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' };
};

/**
 * Deep clone an object
 */
export const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

/**
 * Debounce function
 */
export const debounce = (fn, delay = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

/**
 * Check if a value is empty (null, undefined, '', [], {})
 */
export const isEmpty = (val) => {
  if (val === null || val === undefined || val === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  if (typeof val === 'object' && Object.keys(val).length === 0) return true;
  return false;
};

/**
 * Format date to readable string
 * e.g. "31 Mar 2026, 3:45 PM"
 */
export const formatDateTime = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};
