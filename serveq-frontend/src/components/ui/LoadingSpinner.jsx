import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({
  size = 'md',
  color = '#FF6B35',
  fullScreen = false,
  text = '',
  className = '',
}) {
  const sizes = {
    xs:  16,
    sm:  20,
    md:  32,
    lg:  48,
    xl:  64,
  };

  const px = sizes[size] || sizes.md;

  const spinner = (
    <div className={['flex flex-col items-center justify-center gap-3', className].join(' ')}>
      <Loader2
        size={px}
        style={{ color }}
        className="animate-spin"
        aria-label="Loading"
      />
      {text && (
        <p className="text-sm text-gray-500 font-medium animate-pulse-soft">{text}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return spinner;
}
