import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to play notification sounds
 * Audio file should be placed in public/sounds/
 * - notification-sound.mp3 (plays for both events: "you're next" and "order ready")
 */
export function useNotificationSound() {
  const audioRef = useRef(null);
  const unlockedRef = useRef(false);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio('/sounds/notification-sound.mp3');
      audio.preload = 'auto';
      audio.volume = 1;
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  const unlockAudio = useCallback(async () => {
    if (unlockedRef.current) return;
    const audio = ensureAudio();

    try {
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      unlockedRef.current = true;
    } catch {
      audio.muted = false;
    }
  }, [ensureAudio]);

  useEffect(() => {
    const events = ['pointerdown', 'touchstart', 'keydown'];
    const handler = () => {
      unlockAudio();
    };

    events.forEach((eventName) => window.addEventListener(eventName, handler, { passive: true }));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, handler));
    };
  }, [unlockAudio]);

  const playSound = useCallback(() => {
    try {
      const audio = ensureAudio();
      
      // Reset and play
      audio.currentTime = 0;
      
      // Create a promise to handle autoplay restrictions
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise
          .catch((err) => {
            console.warn('Could not play notification sound:', err);
            // Browser blocked autoplay - this is expected on first interaction
          });
      }
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, [ensureAudio]);

  return { playSound };
}
