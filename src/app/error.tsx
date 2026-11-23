'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-16 h-16 rounded-2xl bg-white border border-surface-200 flex items-center justify-center text-amber-600 mb-4 shadow-sm">
        <RefreshCw size={28} />
      </div>
      <h2 className="text-lg font-bold text-surface-900 mb-1">
        Showhouse Portal
      </h2>
      <p className="text-xs text-surface-500 max-w-sm mb-6">
        Something interrupted the connection. Tap below to refresh the app.
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
          <span>Reload</span>
        </button>
        <Link
          href="/"
          className="btn-secondary px-4 py-2 text-xs flex items-center gap-2"
        >
          <Home size={14} />
          <span>Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
