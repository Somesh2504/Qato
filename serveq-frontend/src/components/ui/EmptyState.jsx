import Button from './Button';

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
  compact = false,
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className,
      ].filter(Boolean).join(' ')}
    >
      {/* Icon */}
      {icon && (
        <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-50 text-gray-400">
          {typeof icon === 'string' ? (
            <span className="text-4xl">{icon}</span>
          ) : (
            <span className="w-8 h-8">{icon}</span>
          )}
        </div>
      )}

      {/* Title */}
      {title && (
        <h3 className={['font-semibold text-[#1A1A2E]', compact ? 'text-base' : 'text-lg'].join(' ')}>
          {title}
        </h3>
      )}

      {/* Description */}
      {description && (
        <p className={['text-gray-500 mt-1.5 max-w-xs', compact ? 'text-xs' : 'text-sm'].join(' ')}>
          {description}
        </p>
      )}

      {/* Action */}
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button variant="primary" size="md" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
