import { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

export function useSupabaseChannelReconnect({ enabled, buildChannel, maxDelayMs = DEFAULT_MAX_DELAY_MS }) {
  const [isReconnecting, setIsReconnecting] = useState(false);
  const timeoutRef = useRef(null);
  const channelRef = useRef(null);
  const delayRef = useRef(DEFAULT_BASE_DELAY_MS);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    const connect = () => {
      if (!mountedRef.current) return;
      const supabase = getSupabaseClient();

      try {
        // Clean up any previous channel before recreating.
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        const channel = buildChannel(supabase);
        channelRef.current = channel;

        channel.subscribe((status) => {
          if (!mountedRef.current) return;

          if (status === 'SUBSCRIBED') {
            setIsReconnecting(false);
            delayRef.current = DEFAULT_BASE_DELAY_MS;
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setIsReconnecting(true);
            const delay = delayRef.current;
            delayRef.current = Math.min(maxDelayMs, delayRef.current * 2);

            timeoutRef.current = window.setTimeout(connect, delay);
          }
        });
      } catch {
        setIsReconnecting(true);
        const delay = delayRef.current;
        delayRef.current = Math.min(maxDelayMs, delayRef.current * 2);
        timeoutRef.current = window.setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      try {
        const supabase = getSupabaseClient();
        if (channelRef.current) supabase.removeChannel(channelRef.current);
      } catch {
        // ignore
      }
      channelRef.current = null;
      setIsReconnecting(false);
    };
  }, [enabled, buildChannel, maxDelayMs]);

  return isReconnecting;
}

