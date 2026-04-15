import React from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white text-center">
      <div className="text-6xl mb-4">⚠️</div>
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">Oops! Something went wrong.</h1>
      <p className="text-gray-500 mb-6 max-w-sm">
        We're sorry, an unexpected error occurred. You can try refreshing the page or going back home.
      </p>
      
      {process.env.NODE_ENV === 'development' && (
        <pre className="text-left bg-gray-100 p-4 rounded-lg text-sm text-red-500 mb-6 max-w-lg overflow-auto">
          {error.message}
        </pre>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={resetErrorBoundary}
          className="px-6 py-3 bg-[#FF6B35] text-white rounded-xl font-medium hover:bg-[#E55A24] transition-colors"
        >
          Try Again
        </button>
        <button
          onClick={() => window.location.href = '/'}
          className="px-6 py-3 bg-gray-100 text-[#1A1A2E] rounded-xl font-medium hover:bg-gray-200 transition-colors"
        >
          Go Home
        </button>
      </div>
      
      <div className="mt-8 text-sm text-gray-400">
        <p>If you're at a restaurant, you can also rescan the QR code to refresh.</p>
      </div>
    </div>
  );
}

export default function ErrorBoundary({ children }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset the state of your app so the error doesn't happen again
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
