const LEGACY_SESSION_ORDERS_KEY = 'qato_session_orders';

function getLocalDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameLocalDay(value, date = new Date()) {
  if (!value) return false;
  const entryDate = new Date(value);
  return (
    entryDate.getFullYear() === date.getFullYear() &&
    entryDate.getMonth() === date.getMonth() &&
    entryDate.getDate() === date.getDate()
  );
}

export function getSessionOrdersKey(restaurantId, date = new Date()) {
  return `qato_session_orders:${restaurantId}:${getLocalDayKey(date)}`;
}

export function readSessionOrders(restaurantId, date = new Date()) {
  if (!restaurantId) return [];

  try {
    const scopedKey = getSessionOrdersKey(restaurantId, date);
    const scoped = JSON.parse(localStorage.getItem(scopedKey) || '[]');
    if (Array.isArray(scoped) && scoped.length > 0) {
      return scoped;
    }
  } catch {
    // fall through to legacy storage
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SESSION_ORDERS_KEY) || '[]');
    if (!Array.isArray(legacy)) return [];
    return legacy.filter(
      (order) => order?.restaurant_id === restaurantId && isSameLocalDay(order?.created_at, date)
    );
  } catch {
    return [];
  }
}

export function writeSessionOrders(restaurantId, orders, date = new Date()) {
  if (!restaurantId) return;

  try {
    localStorage.setItem(getSessionOrdersKey(restaurantId, date), JSON.stringify(orders));
  } catch {
    // ignore localStorage errors
  }
}

export function mergeSessionOrder(restaurantId, order, date = new Date()) {
  if (!restaurantId || !order?.id) return [];

  const currentOrders = readSessionOrders(restaurantId, date);
  const nextOrders = currentOrders.some((entry) => entry.id === order.id)
    ? currentOrders.map((entry) => (entry.id === order.id ? { ...entry, ...order } : entry))
    : [...currentOrders, order];

  writeSessionOrders(restaurantId, nextOrders, date);
  return nextOrders;
}