const variantStyles = {
  // Food type
  veg: {
    className: 'bg-green-50 text-green-700 border border-green-200',
    dot: 'veg-dot',
  },
  nonveg: {
    className: 'bg-red-50 text-red-700 border border-red-200',
    dot: 'nonveg-dot',
  },
  // Order status
  'status-pending':    { className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  'status-confirmed':  { className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  'status-preparing':  { className: 'bg-purple-50 text-purple-700 border border-purple-200' },
  'status-ready':      { className: 'bg-green-50 text-green-700 border border-green-200' },
  'status-delivered':  { className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  'status-cancelled':  { className: 'bg-red-50 text-red-700 border border-red-200' },
  // Payment
  'payment-upi':  { className: 'bg-green-50 text-green-700 border border-green-200' },
  'payment-cash': { className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  'payment-card': { className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  // Generic
  default: { className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  primary: { className: 'bg-orange-50 text-[#FF6B35] border border-orange-200' },
  success: { className: 'bg-green-50 text-green-700 border border-green-200' },
  warning: { className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  danger:  { className: 'bg-red-50 text-red-700 border border-red-200' },
  info:    { className: 'bg-blue-50 text-blue-700 border border-blue-200' },
};

const statusLabels = {
  'status-pending':   'Pending',
  'status-confirmed': 'Confirmed',
  'status-preparing': 'Preparing',
  'status-ready':     'Ready',
  'status-delivered': 'Delivered',
  'status-cancelled': 'Cancelled',
  'payment-upi':      'UPI',
  'payment-cash':     'Cash',
  'payment-card':     'Card',
};

export default function Badge({
  variant = 'default',
  children,
  className = '',
  size = 'sm',
}) {
  const style = variantStyles[variant] || variantStyles.default;
  const label = children ?? statusLabels[variant] ?? variant;
  const hasDot = style.dot;

  const sizes = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 font-medium rounded-[999px] leading-none',
        sizes[size] || sizes.sm,
        style.className,
        className,
      ].filter(Boolean).join(' ')}
    >
      {hasDot && <span className={style.dot} />}
      {label}
    </span>
  );
}
