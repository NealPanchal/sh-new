'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, ArrowLeft, Home } from 'lucide-react';

export default function ChallansError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Challans Page Error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4 shadow-sm">
        <RefreshCw size={26} className="animate-spin-slow" />
      </div>
      <h2 className="text-lg font-bold text-surface-900 mb-1">
        Unable to load Challans
      </h2>
      <p className="text-xs text-surface-500 max-w-sm mb-6">
        A temporary display issue occurred while loading challan records. Tap below to reload fresh data.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.reload();
            } else {
              reset();
            }
          }}
          className="btn-primary px-4 py-2 text-xs flex items-center gap-2"
        >
          <RefreshCw size={14} />
          <span>Reload Page</span>
        </button>
        <Link
          href="/"
          className="btn-secondary px-4 py-2 text-xs flex items-center gap-2"
        >
          <Home size={14} />
          <span>Go to Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
