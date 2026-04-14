import http from 'k6/http';
import { check, sleep } from 'k6';

// 1. Array of different test restaurant IDs
// Replace these with actual UUIDs of restaurants from your database.
// You must grab actual restaurant IDs for the orders to insert successfully!
const RESTAURANT_IDS = [
  'restaurant-uuid-1',
  'restaurant-uuid-2',
  'restaurant-uuid-3'
];

export const options = {
  stages: [
    { duration: '10s', target: 500 },  // Quick ramp up to 500
    { duration: '30s', target: 5000 }, // Spike to 5000 concurrent users hitting Pay
    { duration: '20s', target: 0 },    // Ramp down to cool off
  ],
};

// Based on your index.js, your backend runs on Port 5000 locally
const BASE_URL = 'http://localhost:5000'; 

export default function () {
  // 2. Pick a random restaurant for this specific customer opening the menu
  const randomRestaurantId = RESTAURANT_IDS[Math.floor(Math.random() * RESTAURANT_IDS.length)];

  // 3. Customer places their order in the DB
  const orderPayload = JSON.stringify({
    restaurant_id: randomRestaurantId,
    payment_type: 'online',
    total_amount: 500,
    items: [
      { menu_item_id: 'item_1', item_name: 'Margherita Pizza', item_price: 300, quantity: 1 },
      { menu_item_id: 'item_2', item_name: 'Coke', item_price: 200, quantity: 1 }
    ]
  });

  const orderRes = http.post(`${BASE_URL}/api/orders`, orderPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  // Track if orders successfully insert (Expect 201)
  check(orderRes, { 
    'Order created locally in Supabase (201)': (r) => r.status === 201 
  });
  
  // 4. Customer Hits "Pay" (Simulating reaching out to Razorpay Route)
  const paymentPayload = JSON.stringify({
    amount: 500,
    restaurant_id: randomRestaurantId
  });

  const paymentRes = http.post(`${BASE_URL}/api/payments/create-order`, paymentPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  // Track what happens with Razorpay under load
  check(paymentRes, { 
    'Razorpay order created (200)': (r) => r.status === 200,
    'Razorpay Rate Limited (429/503/400)': (r) => [429, 503, 400].includes(r.status),
    'Server Crashed (5xx)': (r) => r.status >= 500 && r.status !== 503
  });

  // Small sleep to mimic typical web network overhead before next action
  sleep(Math.random() * 1.5);
}
