import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle2, Circle, Loader2, UtensilsCrossed, Package } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { formatIndianPrice } from '../../utils/helpers';
import Button from '../../components/ui/Button';
import toast from 'react-hot-toast';
import api from '../../utils/api';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items, restaurantId, restaurantName, getTotal, getItemCount, clearCart } = useCart();
  const [restaurantLabel, setRestaurantLabel] = useState(restaurantName || '');
  const [paymentOption, setPaymentOption] = useState('upi');
  const [orderType, setOrderType] = useState('eat');
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const subtotal = getTotal();
  const total = subtotal;
  const itemCount = getItemCount();

  // Build the payload the secure backend expects: only IDs + quantities
  const checkoutItems = useMemo(
    () =>
      items.map((item) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        customization_note: item.customizationNote || null,
      })),
    [items]
  );

  useEffect(() => {
    if (restaurantName) {
      setRestaurantLabel(restaurantName);
      return;
    }
    if (!restaurantId) return;

    const fetchRestaurantName = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.from('restaurants').select('name').eq('id', restaurantId).single();
        if (data?.name) setRestaurantLabel(data.name);
      } catch {
        // Non-blocking: UI can continue without restaurant name.
      }
    };

    fetchRestaurantName();
  }, [restaurantId, restaurantName]);

  const setFailure = (message) => {
    const friendly = message || 'Something went wrong. Please try again.';
    setErrorMessage(friendly);
    toast.error(friendly);
  };

  // ── Razorpay SDK loader ─────────────────────────────────────────────────────
  const ensureRazorpaySdk = () =>
    new Promise((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }
      const existingScript = document.querySelector('script[data-razorpay-sdk="true"]');
      if (existingScript) {
        existingScript.addEventListener('load', resolve);
        existingScript.addEventListener('error', () => reject(new Error('Unable to load payment SDK')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.dataset.razorpaySdk = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Unable to load payment SDK'));
      document.body.appendChild(script);
    });

  // ── Open Razorpay Checkout ──────────────────────────────────────────────────
  const openRazorpay = ({ razorpayOrderId, amountPaise }) =>
    new Promise((resolve, reject) => {
      if (!window.Razorpay) {
        reject(new Error('Payment SDK failed to load'));
        return;
      }

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: amountPaise,
        currency: 'INR',
        name: restaurantLabel || 'QRAVE',
        description: 'QRAVE Order Payment',
        order_id: razorpayOrderId,
        // Prefill a dummy contact to skip the phone number prompt on new devices
        prefill: {
          contact: '9999999999',
        },
        method: { upi: true, card: false, netbanking: false, wallet: false, emi: false },
        theme: { color: '#FF6B35' },
        handler: (response) => resolve(response),
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled')),
        },
        // NOTE: We intentionally do NOT reject on payment.failed.
        // Razorpay allows the user to retry (e.g. wrong PIN → re-enter).
        // Only reject when the user explicitly closes the modal (ondismiss above).
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    });

  // ═══════════════════════════════════════════════════════════════════════════
  //  CASH ORDER — goes through secure backend
  // ═══════════════════════════════════════════════════════════════════════════
  const handleCashOrder = async () => {
    if (!restaurantId) {
      setFailure('Restaurant details missing. Please return to menu and try again.');
      return;
    }
    setErrorMessage('');
    setProcessing(true);

    try {
      const { data } = await api.post('/orders/checkout', {
        restaurant_id: restaurantId,
        payment_type: 'cash',
        order_type: orderType,
        items: checkoutItems,
      });

      if (!data?.orderId) {
        throw new Error('Server did not return an order ID');
      }

      clearCart();
      toast.success('Order placed successfully');
      try {
        localStorage.setItem('serveq_a2hs_after_order_ts', String(Date.now()));
      } catch {
        // ignore storage errors
      }
      navigate(`/payment-result?status=success&orderId=${data.orderId}`, { replace: true });
    } catch (error) {
      const backendMsg = error.response?.data?.error;
      setFailure(backendMsg || 'Could not place cash order. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  UPI PAYMENT — secure backend creates order + Razorpay link
  // ═══════════════════════════════════════════════════════════════════════════
  const handleUpiPayment = async () => {
    if (!restaurantId) {
      setFailure('Restaurant details missing. Please return to menu and try again.');
      return;
    }
    if (!import.meta.env.VITE_RAZORPAY_KEY_ID) {
      setFailure('Payment configuration missing. Please contact support.');
      return;
    }

    setErrorMessage('');
    setProcessing(true);

    let orderId = null;

    try {
      // 1. Load SDK
      await ensureRazorpaySdk();

      // 2. Hit secure backend — server validates prices, creates order, creates Razorpay order
      const { data: checkoutData } = await api.post('/orders/checkout', {
        restaurant_id: restaurantId,
        payment_type: 'upi',
        order_type: orderType,
        items: checkoutItems,
      });

      if (!checkoutData?.razorpay_order_id || !checkoutData?.orderId) {
        throw new Error('Could not create payment order');
      }

      orderId = checkoutData.orderId;

      // 3. Open Razorpay checkout (user pays)
      const paymentResponse = await openRazorpay({
        razorpayOrderId: checkoutData.razorpay_order_id,
        amountPaise: checkoutData.razorpay_amount || Math.round(total * 100),
      });

      // 4. Verify signature on the server
      const { data: verifyData } = await api.post('/payments/verify', {
        razorpay_order_id: paymentResponse.razorpay_order_id || checkoutData.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature,
        order_id: orderId,
      });

      if (!verifyData?.success) {
        navigate(`/payment-result?status=failed&orderId=${orderId}`, { replace: true });
        return;
      }

      clearCart();
      toast.success('Payment successful');
      try {
        localStorage.setItem('serveq_a2hs_after_order_ts', String(Date.now()));
      } catch {
        // ignore storage errors
      }
      navigate(`/payment-result?status=success&orderId=${orderId}`, { replace: true });
    } catch (error) {
      // If the user cancelled Razorpay modal, leave the order as pending (they can retry later)
      if (orderId && error.message !== 'Payment cancelled') {
        try {
          const supabase = getSupabaseClient();
          await supabase
            .from('orders')
            .update({ payment_status: 'pending', updated_at: new Date().toISOString() })
            .eq('id', orderId);
        } catch {
          // Ignore cleanup errors
        }
      }

      const backendError = error.response?.data?.error;
      const msg = backendError || error.message || 'UPI payment failed';

      if (error.message === 'Payment cancelled') {
        setFailure('Payment was cancelled. You can try again.');
      } else {
        setFailure(msg);
      }
    } finally {
      setProcessing(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 gap-4">
        <div className="text-5xl">🛒</div>
        <h2 className="text-xl font-bold text-[#1A1A2E]">Your cart is empty</h2>
        <p className="text-gray-500 text-sm">Go back and add some delicious items!</p>
        <Button variant="primary" onClick={() => navigate(-1)}>← Browse Menu</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-28">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-[#1A1A2E]" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-[#1A1A2E]">Checkout & Payment</h1>
          <p className="text-xs text-gray-400">{itemCount} item{itemCount > 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Restaurant</p>
          <p className="text-base font-bold text-[#1A1A2E] mt-1">{restaurantLabel || 'QRAVE Restaurant'}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="font-semibold text-[#1A1A2E] text-sm">Order Summary</h3>
          </div>
          {items.map((item, idx) => (
            <div key={item.id}>
              {idx > 0 && <div className="h-px bg-gray-50 mx-4" />}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[#1A1A2E] text-sm">{item.quantity} x {item.name}</h3>
                    {item.customizationNote && (
                      <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded-lg inline-block">
                        📝 {item.customizationNote}
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[#FF6B35]">{formatIndianPrice(item.price * item.quantity)}</p>
                </div>
              </div>
            </div>
          ))}
          <div className="px-4 pb-4 pt-2 space-y-2.5 border-t border-gray-100">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium">{formatIndianPrice(subtotal)}</span>
            </div>
            <div className="h-px bg-gray-100" />
            <div className="flex justify-between">
              <span className="font-bold text-[#1A1A2E]">Final Total</span>
              <span className="font-bold text-[#FF6B35] text-lg">{formatIndianPrice(total)}</span>
            </div>
          </div>
        </div>

        {/* Eat / Parcel Toggle */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-[#1A1A2E] mb-3 text-sm">Order Type</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setOrderType('eat')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                orderType === 'eat' ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-200'
              }`}
            >
              <UtensilsCrossed size={24} className={orderType === 'eat' ? 'text-[#FF6B35]' : 'text-gray-400'} />
              <span className={`text-sm font-semibold ${orderType === 'eat' ? 'text-[#FF6B35]' : 'text-gray-600'}`}>Eat Here</span>
              <span className="text-[10px] text-gray-400">Dine in at the restaurant</span>
            </button>
            <button
              onClick={() => setOrderType('parcel')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                orderType === 'parcel' ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-200'
              }`}
            >
              <Package size={24} className={orderType === 'parcel' ? 'text-[#FF6B35]' : 'text-gray-400'} />
              <span className={`text-sm font-semibold ${orderType === 'parcel' ? 'text-[#FF6B35]' : 'text-gray-600'}`}>Parcel</span>
              <span className="text-[10px] text-gray-400">Takeaway / pack to go</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-[#1A1A2E] mb-3 text-sm">Payment Options</h3>
          <div className="space-y-3">
            <button
              onClick={() => setPaymentOption('upi')}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                paymentOption === 'upi' ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#1A1A2E]">Pay Now via UPI</p>
                  <p className="text-xs text-gray-500 mt-1">Google Pay, PhonePe, Paytm & all UPI apps</p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="px-2 py-1 text-[10px] bg-white border border-gray-200 rounded-md font-semibold text-[#1A1A2E]">GPay</span>
                    <span className="px-2 py-1 text-[10px] bg-white border border-gray-200 rounded-md font-semibold text-[#1A1A2E]">PhonePe</span>
                    <span className="px-2 py-1 text-[10px] bg-white border border-gray-200 rounded-md font-semibold text-[#1A1A2E]">Paytm</span>
                  </div>
                </div>
                {paymentOption === 'upi' ? (
                  <CheckCircle2 size={20} className="text-[#FF6B35] flex-shrink-0" />
                ) : (
                  <Circle size={20} className="text-gray-300 flex-shrink-0" />
                )}
              </div>
            </button>

            <button
              onClick={() => setPaymentOption('cash')}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                paymentOption === 'cash' ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#1A1A2E]">Pay at Counter (Cash)</p>
                  <p className="text-xs text-gray-500 mt-1">Pay cash when you collect your order</p>
                </div>
                {paymentOption === 'cash' ? (
                  <CheckCircle2 size={20} className="text-[#FF6B35] flex-shrink-0" />
                ) : (
                  <Circle size={20} className="text-gray-300 flex-shrink-0" />
                )}
              </div>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex gap-2 text-red-700">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">Checkout failed</p>
                <p className="text-xs mt-1">{errorMessage}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setErrorMessage('');
                if (paymentOption === 'upi') handleUpiPayment();
                else handleCashOrder();
              }}
              className="mt-3 text-sm font-semibold text-red-700 underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 z-20 shadow-2xl">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={processing}
          onClick={paymentOption === 'upi' ? handleUpiPayment : handleCashOrder}
          className="shadow-lg shadow-orange-500/20"
        >
          {processing ? <Loader2 size={16} className="animate-spin" /> : null}
          {paymentOption === 'upi' ? `Pay ${formatIndianPrice(total)}` : 'Place Order'}
        </Button>
      </div>
    </div>
  );
}
