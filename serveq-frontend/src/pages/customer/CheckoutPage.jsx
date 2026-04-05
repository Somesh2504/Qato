import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [retryLabel, setRetryLabel] = useState('');
  const retryActionRef = useRef(null);

  const subtotal = getTotal();
  const total = subtotal;
  const itemCount = getItemCount();

  const orderItemsPayload = useMemo(
    () =>
      items.map((item) => ({
        menu_item_id: item.id,
        item_name: item.name,
        item_price: item.price,
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

  const setFailure = (message, retryFn, actionLabel) => {
    // Requirement: never show raw error text to users.
    const friendly = message ? 'Checkout failed. Please try again.' : 'Something went wrong. Please try again.';
    setErrorMessage(friendly);
    setRetryLabel(actionLabel);
    retryActionRef.current = retryFn;
    toast.error(friendly);
  };

  const getNextTokenNumber = async (supabase, restId) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (error) throw new Error('Unable to generate token number');
    return (count || 0) + 1;
  };

  const insertOrderAndItems = async ({
    supabase,
    restId,
    tokenNumber,
    paymentType,
    paymentStatus,
    orderTypeValue = 'eat',
    razorpayOrderId = null,
    razorpayPaymentId = null,
  }) => {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id: restId,
        token_number: tokenNumber,
        status: 'pending',
        payment_type: paymentType,
        payment_status: paymentStatus,
        order_type: orderTypeValue,
        total_amount: total,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
      })
      .select()
      .single();

    if (orderError || !order) {
      throw new Error(orderError?.message || 'Unable to create order');
    }

    const { error: itemsError } = await supabase.from('order_items').insert(
      orderItemsPayload.map((item) => ({
        ...item,
        order_id: order.id,
      }))
    );

    if (itemsError) {
      await supabase.from('orders').delete().eq('id', order.id);
      throw new Error(itemsError.message || 'Unable to save order items');
    }

    return order;
  };

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
        method: { upi: true, card: false, netbanking: false, wallet: false, emi: false },
        theme: { color: '#FF6B35' },
        handler: (response) => resolve(response),
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled')),
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', () => reject(new Error('Payment failed')));
      razorpay.open();
    });

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

  const handleCashOrder = async () => {
    if (!restaurantId) {
      setFailure('Restaurant details missing. Please return to menu and try again.', handleCashOrder, 'Retry Place Order');
      return;
    }
    setErrorMessage('');
    setProcessing(true);
    try {
      const supabase = getSupabaseClient();
      const tokenNumber = await getNextTokenNumber(supabase, restaurantId);
      const order = await insertOrderAndItems({
        supabase,
        restId: restaurantId,
        tokenNumber,
        paymentType: 'cash',
        paymentStatus: 'pending',
        orderTypeValue: orderType,
      });
      clearCart();
      toast.success('Order placed successfully');
      try {
        localStorage.setItem('serveq_a2hs_after_order_ts', String(Date.now()));
      } catch {
        // ignore storage errors
      }
      navigate(`/payment-result?status=success&orderId=${order.id}`, { replace: true });
    } catch (error) {
      setFailure(error.message || 'Could not place cash order', handleCashOrder, 'Retry Place Order');
    } finally {
      setProcessing(false);
    }
  };

  const handleUpiPayment = async () => {
    if (!restaurantId) {
      setFailure('Restaurant details missing. Please return to menu and try again.', handleUpiPayment, 'Retry Payment');
      return;
    }
    if (!import.meta.env.VITE_RAZORPAY_KEY_ID) {
      setFailure('Razorpay key missing in environment.', handleUpiPayment, 'Retry Payment');
      return;
    }

    setErrorMessage('');
    setProcessing(true);
    let provisionalOrderId = null;
    try {
      await ensureRazorpaySdk();
      const supabase = getSupabaseClient();

      const { data: edgeData } = await api.post('/payments/create-order', { amount: total, restaurant_id: restaurantId });

      if (!edgeData?.razorpay_order_id) {
        throw new Error('Could not create payment order');
      }

      const tokenNumber = await getNextTokenNumber(supabase, restaurantId);
      const provisionalOrder = await insertOrderAndItems({
        supabase,
        restId: restaurantId,
        tokenNumber,
        paymentType: 'upi',
        paymentStatus: 'pending',
        orderTypeValue: orderType,
        razorpayOrderId: edgeData.razorpay_order_id,
      });
      provisionalOrderId = provisionalOrder.id;

      const paymentResponse = await openRazorpay({
        razorpayOrderId: edgeData.razorpay_order_id,
        amountPaise: edgeData.amount || Math.round(total * 100),
      });

      // Call backend to verify signature and update status securely
      const { data: verifyData } = await api.post('/payments/verify', {
        razorpay_order_id: paymentResponse.razorpay_order_id || edgeData.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature,
        order_id: provisionalOrder.id,
      });

      if (!verifyData?.success) {
        // Payment verification failed — show failure page
        navigate(`/payment-result?status=failed&orderId=${provisionalOrder.id}`, { replace: true });
        return;
      }

      clearCart();
      toast.success('Payment successful');
      try {
        localStorage.setItem('serveq_a2hs_after_order_ts', String(Date.now()));
      } catch {
        // ignore storage errors
      }
      navigate(`/payment-result?status=success&orderId=${provisionalOrder.id}`, { replace: true });
    } catch (error) {
      if (provisionalOrderId) {
        try {
          const supabase = getSupabaseClient();
          await supabase
            .from('orders')
            .update({ payment_status: 'pending', updated_at: new Date().toISOString() })
            .eq('id', provisionalOrderId);
        } catch {
          // Ignore cleanup/update errors.
        }
      }
      setFailure(error.message || 'UPI payment failed', handleUpiPayment, 'Retry Payment');
    } finally {
      setProcessing(false);
    }
  };

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
            {retryActionRef.current && (
              <button
                onClick={() => retryActionRef.current?.()}
                className="mt-3 text-sm font-semibold text-red-700 underline"
              >
                {retryLabel || 'Retry'}
              </button>
            )}
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
