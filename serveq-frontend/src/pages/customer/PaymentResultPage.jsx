import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, ArrowRight, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import Button from '../../components/ui/Button';

const REDIRECT_DELAY = 4; // seconds

export default function PaymentResultPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const status = searchParams.get('status'); // 'success' or 'failed'
  const orderId = searchParams.get('orderId');
  const isSuccess = status === 'success';

  const [countdown, setCountdown] = useState(REDIRECT_DELAY);
  const confettiFiredRef = useRef(false);

  // Fire confetti on success
  useEffect(() => {
    if (isSuccess && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      setTimeout(() => {
        confetti({
          particleCount: 200,
          spread: 100,
          origin: { y: 0.5 },
          colors: ['#FF6B35', '#22C55E', '#F59E0B', '#1A1A2E', '#3B82F6'],
        });
      }, 300);
    }
  }, [isSuccess]);

  // Countdown → auto-redirect
  useEffect(() => {
    if (!orderId) return;

    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    if (countdown !== 0) return;
    navigate(`/order/${orderId}`, { replace: true });
  }, [countdown, orderId, navigate]);

  const handleGoToOrder = () => {
    if (orderId) {
      navigate(`/order/${orderId}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleRetryOrHome = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      {/* Animated Icon */}
      <div
        className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
          isSuccess
            ? 'bg-green-100 text-green-600'
            : 'bg-red-100 text-red-600'
        }`}
        style={{
          animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}
      >
        {isSuccess ? (
          <CheckCircle2 size={48} strokeWidth={2} />
        ) : (
          <XCircle size={48} strokeWidth={2} />
        )}
      </div>

      {/* Title */}
      <h1
        className={`text-2xl font-extrabold mb-2 ${
          isSuccess ? 'text-green-700' : 'text-red-700'
        }`}
      >
        {isSuccess ? 'Payment Successful!' : 'Payment Failed'}
      </h1>

      {/* Subtitle */}
      <p className="text-gray-500 text-sm text-center max-w-xs mb-6">
        {isSuccess
          ? "Your order has been placed and payment confirmed. You\u2019ll be redirected to your order tracker shortly."
          : 'Something went wrong with your payment. No money has been deducted. Please try again.'}
      </p>

      {/* Countdown (success only) */}
      {isSuccess && orderId && countdown > 0 && (
        <div className="flex items-center gap-2 text-gray-400 text-xs mb-6">
          <Loader2 size={14} className="animate-spin" />
          Redirecting in {countdown}s…
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {isSuccess ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleGoToOrder}
            icon={<ArrowRight size={16} />}
          >
            Track Your Order
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleRetryOrHome}
            >
              Go Back & Retry
            </Button>
            {orderId && (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                onClick={handleGoToOrder}
              >
                View Order Status
              </Button>
            )}
          </>
        )}
      </div>

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes scaleIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
