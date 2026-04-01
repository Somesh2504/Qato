import { Loader2 } from 'lucide-react';

const variants = {
  primary:   'bg-[#FF6B35] text-white hover:bg-[#E55A24] active:bg-[#CC4E1F] shadow-sm hover:shadow-md',
  secondary: 'bg-[#1A1A2E] text-white hover:bg-[#16213E] active:bg-[#0F1525] shadow-sm',
  ghost:     'bg-transparent text-[#FF6B35] border border-[#FF6B35] hover:bg-[#FF6B35]/10 active:bg-[#FF6B35]/20',
  danger:    'bg-[#EF4444] text-white hover:bg-[#DC2626] active:bg-[#B91C1C] shadow-sm',
  outline:   'bg-white text-[#1A1A2E] border border-gray-200 hover:border-gray-300 hover:bg-gray-50 shadow-sm',
  success:   'bg-[#22C55E] text-white hover:bg-[#16A34A] active:bg-[#15803D] shadow-sm',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  children,
  type = 'button',
  className = '',
  icon,
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center font-medium rounded-[8px]',
        'transition-all duration-200 ease-out cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-[#FF6B35] focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} className="animate-spin flex-shrink-0" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children && <span>{children}</span>}
    </button>
  );
}
