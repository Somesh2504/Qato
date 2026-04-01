import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'serveq_a2hs_after_order_ts';
const DEFAULT_DELAY_MS = 30000;

export function useAddToHomeScreenPrompt({ showDelayMs = DEFAULT_DELAY_MS } = {}) {
  const deferredPromptRef = useRef(null);
  const [promptSupported, setPromptSupported] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [readyToPrompt, setReadyToPrompt] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    const handler = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setPromptSupported(true);
      // If we already decided to show, mark as ready.
      setReadyToPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const showAfterOrderIfRecent = useCallback(() => {
    try {
      const ts = Number(localStorage.getItem(STORAGE_KEY) || 0);
      if (!ts) return false;
      const age = Date.now() - ts;
      // Show if within last hour.
      if (age < 60 * 60 * 1000) return true;
    } catch {
      // ignore
    }
    return false;
  }, []);

  useEffect(() => {
    const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    const wantsImmediate = showAfterOrderIfRecent();
    if (wantsImmediate) {
      // If prompt is already captured, open now. Otherwise wait for capture.
      if (promptSupported) setPromptOpen(true);
      return;
    }

    const t = window.setTimeout(() => {
      if (!promptSupported) return;
      setPromptOpen(true);
    }, showDelayMs);

    return () => window.clearTimeout(t);
  }, [promptSupported, showAfterOrderIfRecent, showDelayMs]);

  const trigger = useCallback(async () => {
    const deferred = deferredPromptRef.current;
    if (!deferred) return;
    deferredPromptRef.current = null;
    setPromptOpen(false);

    try {
      deferred.prompt();
      await deferred.userChoice;
    } catch {
      // ignore
    } finally {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  const markOrderPlaced = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  const reset = useCallback(() => setPromptOpen(false), []);

  const canShow = useMemo(() => promptSupported && readyToPrompt, [promptSupported, readyToPrompt]);

  return {
    promptOpen: promptOpen && canShow,
    setPromptOpen,
    trigger,
    markOrderPlaced,
  };
}

