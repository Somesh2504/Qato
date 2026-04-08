import { useRef, useCallback } from 'react';

/**
 * Hook to play notification sounds
 * Audio file should be placed in public/sounds/
 * - notification-sound.mp3 (plays for both events: "you're next" and "order ready")
 */
export function useNotificationSound() {
  const audioRef = useRef(null);

  const playSound = useCallback(() => {
    try {
      // Lazy load audio element (same sound for all notifications)
      if (!audioRef.current) {
        const audio = new Audio();
        audio.src = '/sounds/notification-sound.mp3';
        audio.volume = 1; // Full volume
        audioRef.current = audio;
      }

      const audio = audioRef.current;
      
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
  }, []);

  return { playSound };
}
