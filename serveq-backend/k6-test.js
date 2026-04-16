import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const RESTAURANT_IDS = (__ENV.RESTAURANT_IDS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const ENABLE_PAYMENT = (__ENV.ENABLE_PAYMENT || '0') === '1';

if (RESTAURANT_IDS.length === 0) {
  throw new Error('Set RESTAURANT_IDS env var with comma-separated restaurant UUIDs before running k6.');
}

export const options = {
  scenarios: {
    customer_checkout_flow: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 30,
      maxVUs: 200,
      stages: [
        { target: 20, duration: '2m' },
        { target: 50, duration: '5m' },
        { target: 80, duration: '3m' },
        { target: 0, duration: '1m' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<900', 'p(99)<1800'],
    checks: ['rate>0.99'],
  },
};

function pickRestaurantId() {
  return RESTAURANT_IDS[Math.floor(Math.random() * RESTAURANT_IDS.length)];
}

function randomAmount() {
  return Math.floor(Math.random() * 250) + 50; // 50 - 299 INR
}

export default function () {
  const restaurantId = pickRestaurantId();

  // Health check keeps baseline visibility for backend uptime during load.
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health endpoint is reachable': (r) => r.status === 200,
  });

  const amount = randomAmount();
  const orderPayload = JSON.stringify({
    restaurant_id: restaurantId,
    payment_type: 'cash',
    total_amount: amount,
    items: [
      { item_name: 'Load Test Item A', item_price: amount, quantity: 1 },
    ],
  });

  const orderRes = http.post(`${BASE_URL}/api/orders`, orderPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(orderRes, {
    'order create status is 201': (r) => r.status === 201,
  });

  if (ENABLE_PAYMENT) {
    const paymentPayload = JSON.stringify({
      amount,
      restaurant_id: restaurantId,
    });

    const paymentRes = http.post(`${BASE_URL}/api/payments/create-order`, paymentPayload, {
      headers: {
        'Content-Type': 'application/json',
        'x-idempotency-key': `${__VU}-${__ITER}-${restaurantId}`,
      },
    });

    check(paymentRes, {
      'payment create order succeeds or is controlled failure': (r) =>
        r.status === 200 || r.status === 400 || r.status === 429 || r.status === 503,
      'payment create order avoids unexpected 5xx': (r) => r.status < 500 || r.status === 503,
    });
  }

  sleep(Math.random() * 1.2);
}
