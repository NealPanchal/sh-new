'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  loginAdmin,
  isAdminAuthenticated,
} from '@/lib/auth';

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
    document.title = 'Showhouse — Login';

    if (isAdminAuthenticated()) {
      router.replace('/');
    }
  }, [router]);

  // Submit Username & Password
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUser = username.trim();
    if (!cleanUser) {
      setError('Please enter your username');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);

    try {
      const res = await loginAdmin(cleanUser, password);
      if (res.success) {
        router.replace('/');
      } else {
        setError(res.error || 'Invalid credentials. Please check your username and password.');
        setLoading(false);
      }
    } catch {
      setError('Authentication failed. Please check network connection.');
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden select-none animate-in fade-in duration-300">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-[#b8860b]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-sm sm:max-w-md bg-surface-900 border border-surface-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative z-10 text-white animate-in zoom-in-95 duration-200">
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
            <span>Secure System Access</span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-start gap-2.5 animate-in slide-in-from-top-1">
            <ShieldAlert size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-surface-300 mb-1.5 uppercase tracking-wider">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-surface-500">
                <User size={16} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-surface-950 border border-surface-700 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all font-sans"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-surface-300 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-surface-500">
                <Lock size={16} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
                className="w-full pl-10 pr-10 py-2.5 bg-surface-950 border border-surface-700 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-surface-500 hover:text-surface-300 transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-primary-600 via-primary-500 to-amber-600 hover:from-primary-500 hover:to-amber-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-primary-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-6 pt-5 border-t border-surface-800/80 text-center text-[11px] text-surface-400">
          <span>Showhouse ERP — Laminates & Interior Solutions</span>
        </div>
      </div>
    </div>
  );
}
