import Button from './Button';

export default function OfflineBanner({ onRetry }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[1000]">
      <div className="mx-3 mt-3 md:mx-6 bg-red-50 border border-red-200 text-red-700 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">📴</span>
            <p className="text-sm font-semibold truncate">You're offline — please check your connection</p>
          </div>
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

