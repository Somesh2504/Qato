# Qato (ServeQ) - Project Context & Animation Guidelines

## 1. Project Overview
**QRave** (formerly ServeQ) is a modern SaaS food-ordering platform. It facilitates a seamless digital dining experience by enabling customers to scan QR codes, view digital menus, place orders, and pay online. Waitstaff and restaurant admins manage these orders in real-time through an administrative dashboard.

**Tech Stack:**
- **Frontend Framework:** React 19 + Vite 
- **Styling:** TailwindCSS 4 + Custom Vanilla CSS variables
- **Backend/Database:** Supabase (PostgreSQL, Auth, Realtime)
- **Payment Gateway:** Razorpay
- **Icons & Visuals:** Lucide React, Canvas Confetti

## 2. Brand Identity & UI/UX Guidelines
Any generated animations (Lottie or CSS) must strictly adhere to the following brand guidelines to maintain the premium, modern aesthetic of Qato.

### Color Palette
- **Primary (Brand):** `#FF6B35` (Vibrant Orange)
- **Primary Dark:** `#E55A24`
- **Secondary (Text/Headings):** `#1A1A2E` (Deep Navy/Black)
- **Secondary Light:** `#16213E`
- **Background/Surface:** `#FFFFFF` (White) and `#FAFAFA` (Off-white)
- **Success:** `#22C55E` (Green - used for Veg items and success states)
- **Danger:** `#EF4444` or `#DC2626` (Red - used for Non-Veg items and errors)
- **Warning:** `#F59E0B`

### Typography & Styling
- **Font Family:** `Inter`, system-ui, sans-serif
- **Shapes:** Soft, modern corners.
  - Cards: `16px` border-radius
  - Buttons/Inputs: `12px` border-radius
  - Badges: `999px` (fully rounded)
- **Shadows:** Soft drop-shadows on hover (`box-shadow: 0 8px 30px rgba(0,0,0,0.06)`)

### Existing Animation Language
The app currently uses smooth, dynamic micro-interactions natively in CSS:
- **Transitions:** `0.25s cubic-bezier(0.4, 0, 0.2, 1)`
- **Keyframes in use:** `fadeIn`, `fadeInScale`, `slideUp`, `slideDown`, `slideInRight`, `pulse-soft`, `bounceIn`, `float`, `wiggle`, `scaleIn`, `glow`, `pageEnter`.
- Animations should feel **snappy and responsive**, never sluggish.

## 3. Application Structure & User Flows
To contextually generate Lottie animations, understand the main user journeys:

### Customer Flow (Mobile-First)
1. **Menu Page (`/menu/:slug`):** Customer views categories and items.
2. **Checkout Page (`/checkout`):** Customer reviews cart and initiates payment.
3. **Payment Result (`/payment-result`):** Success or failure state post-Razorpay.
4. **Order Status (`/order/:orderId`):** Live tracking of order (e.g., "Queue", "Preparing", "Completed").

### Admin/Restaurant Flow (Desktop/Tablet)
1. **Landing & Onboarding (`/`, `/signup`, `/login`):** Marketing and authentication.
2. **Live Orders (`/admin/orders`):** Real-time queue of incoming orders.
3. **Menu Management (`/admin/menu`):** Adding/editing items.
4. **Analytics (`/admin/analytics`):** Sales metrics and reports.

## 4. Recommended Use Cases for Lottie Animations
When prompting AI tools for Lottie JSON files, use this context to request the following animations:

1. **Order Success (Customer Flow):**
   - **Where:** `PaymentResultPage.jsx`
   - **Concept:** A snappy, satisfying checkmark drawing itself in `#22C55E` (green), surrounded by subtle `#FF6B35` (orange) confetti bursts.
   - **Vibe:** Exciting, reassuring.

2. **Empty States (Admin/Customer):**
   - **Where:** Cart empty, no live orders, no menu items.
   - **Concept:** A minimalist illustration of an empty covered plate or a clipboard with a soft, looping `float` animation in grayscale or soft orange `#FF6B35`.
   - **Vibe:** Clean, premium, non-distracting.

3. **Loading Spinners & Screens (Global):**
   - **Where:** Initial app load, payment processing, data fetching.
   - **Concept:** A modern, geometric spinner or a stylized food item (like a cloche/cover) bouncing gently. Colors should be `primary` `#FF6B35` and `secondary` `#1A1A2E`.
   - **Vibe:** Premium, modern.

4. **Order Preparing / Live Tracking (Customer Flow):**
   - **Where:** `OrderStatusPage.jsx`
   - **Concept:** An animation of a pan tossing food, cooking steam rising, or a clock winding down in a loop.
   - **Vibe:** Dynamic, keeps the user entertained while waiting.

5. **404 Page (Global):**
   - **Where:** Fallback route.
   - **Concept:** A dropped ice cream cone or spilled plate with a `wiggle` or `bounceIn` effect.
   - **Vibe:** Playful but matching the theme.

## 5. System Prompt Add-on for AI Animation Generators
When providing this document to an AI animation tool (like LottieLab, Jitter, or an LLM generating SVG/Lottie JSON), copy and paste this exact prompt snippet:

> **"I am building 'Qato', a modern restaurant ordering platform. Please generate a [INSERT ANIMATION TYPE HERE] animation. Use the brand's primary orange (#FF6B35) and secondary dark navy (#1A1A2E). The design should be clean, flat-vector style with soft rounded corners to match a modern TailwindCSS aesthetic. Do not use overly complex gradients or outlines. The animation should ideally loop seamlessly and feel snappy (24fps+). Keep the background fully transparent."**
