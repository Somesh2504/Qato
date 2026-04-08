# Notification Sound Configuration

This directory contains the notification sound file for the Qato customer order tracking feature.

## 📍 File Placement

Place your audio file in this directory with the following name:

### `notification-sound.mp3`
- **Triggered when:** 
  1. Customer is next in queue (only 1 order ahead) → "⏭️ You're next!"
  2. Order is ready for pickup (status = "done") → "🎉 Your order is ready!"
- **Use case:** Alert customer at critical moments in their order journey
- **Recommended:** A clear, satisfying iPhone-style notification "ding" sound
- **Suggested duration:** 1-2 seconds

## 📋 Audio Requirements

- **Format:** MP3 or WAV (MP3 recommended for better browser compatibility)
- **Bitrate:** 128-256 kbps
- **Sample Rate:** 44.1 kHz or 48 kHz
- **Channels:** Mono or Stereo
- **Volume:** Keep peaks around -6dB to -3dB to avoid distortion

## ✅ How It Works

1. When a customer is tracking their order on the `/order/:orderId` page
2. The system monitors the queue position in real-time
3. When only 1 order is ahead → `notification-sound.mp3` plays once
4. When the order status changes to "done" → `notification-sound.mp3` plays again + confetti animation
5. Toast notifications also appear on screen to supplement the sound

## 🔊 Testing

After placing the audio file:
1. Open DevTools (F12) Console to check for any audio loading errors
2. Navigate to the order tracking page
3. Wait for the queue position to change to 1 (or simulate it)
4. Listen for the notification sound
5. Wait for order to be marked "done" to hear the second trigger

## 🎵 Recommended Sound Sources

If you don't have a custom sound file, here are some free resources for iPhone-style notification dings:

- **Zapsplat** (https://www.zapsplat.com) - Free sound effects (search "notification ding")
- **Freesound** (https://freesound.org) - Community sound library (search "notification")
- **iPhone Alert Sounds** - Search "iOS notification sound" on free sound libraries
- **Pixabay Sounds** (https://pixabay.com/sound-effects/) - Royalty-free sounds
- **Notification Sounds** - Various free sources online

## 🔧 Notes

- Sound plays at full volume (can be controlled by browser/device mute settings)
- Browser autoplay restrictions may apply - sounds triggered after user interaction
- Mobile browsers (iOS) may have autoplay restrictions requiring user gesture
- Same sound plays for both events (queue alert + ready alert)

