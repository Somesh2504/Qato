export default function Card({
  children,
  className = '',
  padding = 'md',
  hoverable = false,
  onClick,
  noBorder = false,
}) {
  const paddings = {
    none: 'p-0',
    sm:   'p-3',
    md:   'p-4',
    lg:   'p-6',
    xl:   'p-8',
  };

  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-[12px] shadow-sm',
        noBorder ? '' : 'border border-gray-100',
        paddings[padding] || paddings.md,
        hoverable ? 'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer' : '',
        onClick ? 'cursor-pointer' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
