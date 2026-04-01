export default function SkeletonCard({
  className = '',
  height = 'auto',
  lines = 3,
  showImage = false,
  showAvatar = false,
  variant = 'default',
}) {
  if (variant === 'menu-item') {
    return (
      <div className={['bg-white rounded-[12px] border border-gray-100 p-4 flex gap-3', className].join(' ')}>
        <div className="flex-1 space-y-2.5">
          <div className="skeleton h-4 w-2/3 rounded-md" />
          <div className="skeleton h-3 w-full rounded-md" />
          <div className="skeleton h-3 w-4/5 rounded-md" />
          <div className="flex items-center justify-between mt-3">
            <div className="skeleton h-5 w-16 rounded-md" />
            <div className="skeleton h-8 w-20 rounded-lg" />
          </div>
        </div>
        <div className="skeleton w-24 h-24 rounded-xl flex-shrink-0" />
      </div>
    );
  }

  if (variant === 'order-card') {
    return (
      <div className={['bg-white rounded-[12px] border border-gray-100 p-4 space-y-3', className].join(' ')}>
        <div className="flex items-center justify-between">
          <div className="skeleton h-5 w-24 rounded-md" />
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
        <div className="skeleton h-3 w-40 rounded-md" />
        <div className="space-y-2">
          <div className="skeleton h-3 w-full rounded-md" />
          <div className="skeleton h-3 w-3/4 rounded-md" />
        </div>
        <div className="flex justify-between items-center pt-1">
          <div className="skeleton h-4 w-20 rounded-md" />
          <div className="skeleton h-8 w-24 rounded-lg" />
        </div>
      </div>
    );
  }

  if (variant === 'stat-card') {
    return (
      <div className={['bg-white rounded-[12px] border border-gray-100 p-5 space-y-3', className].join(' ')}>
        <div className="flex items-center justify-between">
          <div className="skeleton h-10 w-10 rounded-xl" />
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
        <div className="skeleton h-8 w-28 rounded-md" />
        <div className="skeleton h-3 w-32 rounded-md" />
      </div>
    );
  }

  // Default
  return (
    <div
      className={['bg-white rounded-[12px] border border-gray-100 p-4 space-y-3', className].join(' ')}
      style={{ height: height !== 'auto' ? height : undefined }}
    >
      {showImage && (
        <div className="skeleton w-full h-36 rounded-lg" />
      )}
      {showAvatar && (
        <div className="flex items-center gap-3">
          <div className="skeleton w-10 h-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-32 rounded-md" />
            <div className="skeleton h-3 w-24 rounded-md" />
          </div>
        </div>
      )}
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton rounded-md"
          style={{
            height: '12px',
            width: i === lines - 1 ? '60%' : i % 2 === 0 ? '100%' : '85%',
          }}
        />
      ))}
    </div>
  );
}
