'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';
import { loginAdmin, isAdminAuthenticated } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isAdminAuthenticated()) {
      router.replace('/');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter admin username');
      return;
    }
    if (!password) {
      setError('Please enter admin password');
      return;
    }

    setLoading(true);

    try {
      const res = await loginAdmin(username, password);
      if (res.success) {
        router.replace('/');
      } else {
        setError(res.error || 'Invalid admin credentials. Please try again.');
        setLoading(false);
      }
    } catch {
      setError('Authentication failed. Please check network or try again.');
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden select-none">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-[#b8860b]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-sm sm:max-w-md bg-surface-900 border border-surface-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative z-10 text-white">
        {/* Brand Logo & Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-white p-2.5 shadow-xl shadow-amber-500/10 border border-amber-200/40 mb-3.5 flex items-center justify-center">
            <img
              src="/logo-emblem.png"
              alt="Showhouse Decor Studio"
              className="w-full h-full object-contain"
            />
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white font-serif">
            SHOWHOUSE
          </h1>
          <p className="text-[11px] font-semibold tracking-widest text-[#b8860b] uppercase mt-0.5">
            — Decor Studio —
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-3 rounded-full bg-surface-800/80 border border-surface-700/60 text-[10px] text-surface-300 font-medium">
            <ShieldCheck size={12} className="text-emerald-400" />
            <span>Secure Portal • Admin & Staff</span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/80 border border-red-800/80 text-red-200 text-xs flex items-start gap-2">
            <span className="shrink-0 mt-0.5 text-red-400 font-bold">•</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-surface-300 uppercase tracking-wider block mb-1.5">
              Username
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none"
              />
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username (admin or staff)"
                className="w-full bg-surface-950 border border-surface-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-white rounded-lg pl-9 pr-3 py-2.5 text-xs outline-hidden transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-surface-300 uppercase tracking-wider block mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-surface-950 border border-surface-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-white rounded-lg pl-9 pr-10 py-2.5 text-xs outline-hidden transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors p-0.5"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-bold text-xs shadow-md shadow-primary-900/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In to Showhouse</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-6 pt-4 border-t border-surface-800 text-center">
          <p className="text-[10px] text-surface-500">
            Showhouse Concept & Design LLP • All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
