import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';

/**
 * useRealtimeOrders
 * Subscribes to Supabase realtime updates for orders table
 *
 * @param {string} restaurantId - The restaurant to filter orders for
 * @param {function} onInsert - Called when new order is placed
 * @param {function} onUpdate - Called when order status changes
 * @param {object} options - { enabled: bool }
 */
export function useRealtimeOrders(restaurantId, onInsert, onUpdate, options = {}) {
  const { enabled = true } = options;
  const channelRef = useRef(null);
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);

  // Keep refs up-to-date without re-subscribing
  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!enabled || !restaurantId) return;

    let supabase = null;
    try {
      supabase = getSupabaseClient();
    } catch {
      console.warn('Supabase not configured — realtime orders disabled');
      return;
    }

    const channelName = `orders:restaurant_id=eq.${restaurantId}`;

    channelRef.current = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (onInsertRef.current) onInsertRef.current(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (onUpdateRef.current) onUpdateRef.current(payload.new, payload.old);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Subscribed to orders for restaurant:', restaurantId);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error');
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [restaurantId, enabled]);
}

/**
 * useRealtimeOrderStatus
 * Subscribes to a single order's status changes
 *
 * @param {string} orderId - The order to track
 * @param {function} onUpdate - Called when order updates
 */
export function useRealtimeOrderStatus(orderId, onUpdate) {
  const channelRef = useRef(null);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!orderId) return;

    let supabase = null;
    try {
      supabase = getSupabaseClient();
    } catch {
      return;
    }

    const channelName = `order:id=eq.${orderId}`;

    channelRef.current = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          if (onUpdateRef.current) onUpdateRef.current(payload.new);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [orderId]);
}
