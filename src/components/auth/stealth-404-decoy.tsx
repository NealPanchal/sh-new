'use client';

import React, { useState, useRef, useEffect } from 'react';

interface Stealth404DecoyProps {
  onUnlock: () => void;
}

export function Stealth404Decoy({ onUnlock }: Stealth404DecoyProps) {
  const [tapCount, setTapCount] = useState(0);
  const lastTapTimeRef = useRef(0);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Set document title to genuine 404 when decoy is mounted
  useEffect(() => {
    const originalTitle = document.title;
    document.title = '404 - Page Not Found';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  // Cleanup reset timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();

    // Prevent duplicate synthetic events within 120ms (e.g. touchstart followed by click)
    if (now - lastTapTimeRef.current < 120) {
      return;
    }
    lastTapTimeRef.current = now;

    // Subtle tactile haptic vibration for mobile finger taps
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {}
    }

    // Clear existing inactivity timeout
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    setTapCount((prev) => {
      const next = prev + 1;

      // When clicked 8 times, unlock the login!
      if (next >= 8) {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([40, 50, 40]);
          } catch {}
        }
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('sh_stealth_unlocked', 'true');
        }
        onUnlock();
        return 0;
      }

      return next;
    });

    // Reset counter if user stops clicking for 4.5 seconds
    resetTimerRef.current = setTimeout(() => {
      setTapCount(0);
    }, 4500);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 flex flex-col justify-between items-center px-4 py-8 relative overflow-hidden select-none font-sans">
      {/* Background subtle noise/vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(#18181b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

      {/* Top spacer */}
      <div className="h-6 w-full" />

      {/* Main Error Block */}
      <div
        onClick={handleTap}
        className="flex flex-col items-center justify-center text-center max-w-md mx-auto my-auto p-6 sm:p-8 cursor-default touch-manipulation select-none active:scale-[0.99] transition-transform z-10"
        style={{ WebkitTapHighlightColor: 'transparent' }}
        role="button"
        tabIndex={-1}
        aria-label="Error 404"
      >
        {/* Error Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 mb-6 shadow-xs select-none">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="font-bold text-red-400 tracking-wider">ERROR 404</span>
        </div>

        {/* 404 Code & Heading */}
        <div className="space-y-3 select-none">
          <h1 className="text-8xl sm:text-9xl font-black font-mono tracking-tighter text-zinc-100 select-none">
            404
          </h1>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-200 select-none">
            Page Not Found
          </h2>

          <p className="text-xs sm:text-sm text-zinc-500 max-w-xs sm:max-w-sm mx-auto leading-relaxed select-none">
            The requested URL was not found on this server. The link you followed may be broken, or the page may have been removed.
          </p>
        </div>

        {/* Status Line */}
        <div className="mt-8 pt-6 border-t border-zinc-900/90 text-[11px] font-mono text-zinc-600 flex items-center justify-center gap-2 select-none">
          <span>HTTP 404 • Not Found</span>
          <span>•</span>
          <span>Server Error</span>
        </div>
      </div>

      {/* Minimal Footer */}
      <div className="text-[11px] font-mono text-zinc-700 text-center select-none z-10">
        404 Not Found • Host Edge Gateway
      </div>
    </div>
  );
}

