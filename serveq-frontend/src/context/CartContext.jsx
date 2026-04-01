import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantSlug, setRestaurantSlug] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [tableNumber, setTableNumber] = useState(null);

  const addItem = useCallback((item) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1, customizationNote: '' }];
    });
  }, []);

  const removeItem = useCallback((itemId) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const updateQuantity = useCallback((itemId, quantity) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, quantity } : i))
    );
  }, []);

  const updateCustomizationNote = useCallback((itemId, note) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, customizationNote: note } : i))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const getTotal = useCallback(() => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [items]);

  const getItemCount = useCallback(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  const getItemQuantity = useCallback(
    (itemId) => {
      const found = items.find((i) => i.id === itemId);
      return found ? found.quantity : 0;
    },
    [items]
  );

  const initializeCart = useCallback((restId, restSlug, table, restName = '') => {
    setRestaurantId(restId);
    setRestaurantSlug(restSlug);
    setTableNumber(table);
    setRestaurantName(restName);
  }, []);

  const value = useMemo(
    () => ({
      items,
      restaurantId,
      restaurantSlug,
      restaurantName,
      tableNumber,
      addItem,
      removeItem,
      updateQuantity,
      updateCustomizationNote,
      clearCart,
      getTotal,
      getItemCount,
      getItemQuantity,
      initializeCart,
    }),
    [
      items,
      restaurantId,
      restaurantSlug,
      restaurantName,
      tableNumber,
      addItem,
      removeItem,
      updateQuantity,
      updateCustomizationNote,
      clearCart,
      getTotal,
      getItemCount,
      getItemQuantity,
      initializeCart,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
