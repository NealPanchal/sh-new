'use client';

import React from 'react';
import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-300 flex flex-col justify-center items-center px-4 py-8 select-none font-sans">
      <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto p-6 sm:p-8">
        <div className="w-16 h-16 rounded-2xl bg-surface-900 border border-surface-800 p-2.5 mb-6 flex items-center justify-center shadow-xl">
          <img
            src="/logo-emblem.png"
            alt="Showhouse"
            className="w-full h-full object-contain"
          />
        </div>
        <h1 className="text-6xl sm:text-7xl font-black tracking-tight text-white mb-2">404</h1>
        <h2 className="text-xl font-bold text-surface-200 mb-2">Page Not Found</h2>
        <p className="text-sm text-surface-400 mb-8 max-w-xs">
          The page you requested could not be found or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium text-sm transition-colors shadow-lg shadow-primary-600/25"
        >
          <Home size={16} />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
