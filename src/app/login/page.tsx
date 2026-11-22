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
  Smartphone,
  RefreshCw,
  KeyRound,
  Check,
  Copy,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import {
  loginAdmin,
  verifyLoginOtp,
  resendLoginOtp,
  isAdminAuthenticated,
} from '@/lib/auth';
import { Stealth404Decoy } from '@/components/auth/stealth-404-decoy';

export default function LoginPage() {
  const router = useRouter();

  // Navigation & Step state
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // 2FA OTP Challenge state
  const [challengeId, setChallengeId] = useState('');
  const [targetMasked, setTargetMasked] = useState('');
  const [targetPhone, setTargetPhone] = useState('');
  const [otpPreview, setOtpPreview] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [copied, setCopied] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setMounted(true);

    // If previously unlocked in this browser tab session, restore visibility
    if (typeof window !== 'undefined' && sessionStorage.getItem('sh_stealth_unlocked') === 'true') {
      setIsUnlocked(true);
    }

    if (isAdminAuthenticated()) {
      router.replace('/');
    }
  }, [router]);

  useEffect(() => {
    if (mounted) {
      if (isUnlocked) {
        document.title = step === 'otp' ? 'Showhouse — 2-Step Verification' : 'Showhouse — Login';
      } else {
        document.title = '404 - Page Not Found';
      }
    }
  }, [isUnlocked, mounted, step]);

  // Countdown timer for OTP expiry and resend cooldown
  useEffect(() => {
    if (step !== 'otp') return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [step]);

  const handleUnlock = () => {
    setIsUnlocked(true);
  };

  const handleLockBack = () => {
    setIsUnlocked(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('sh_stealth_unlocked');
    }
  };

  // Step 1: Submit Username & Password
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter username');
      return;
    }
    if (!password) {
      setError('Please enter password');
      return;
    }

    setLoading(true);

    try {
      const res = await loginAdmin(username.trim(), password);
      if (res.success) {
        if (res.requires_otp) {
          // Transition to OTP 2FA step
          setChallengeId(res.challenge_id || '');
          setTargetMasked(res.target_masked || 'Registered Device');
          setTargetPhone(res.phone || '');
          setOtpPreview(res.otp_preview || '');
          setSecondsLeft(res.expires_in_seconds || 300);
          setResendCooldown(30);
          setOtpCode('');
          setStep('otp');
          setLoading(false);
        } else {
          // Direct login (when OTP disabled in settings)
          router.replace('/');
        }
      } else {
        setError(res.error || 'Invalid credentials. Please try again.');
        setLoading(false);
      }
    } catch {
      setError('Authentication failed. Please check network connection.');
      setLoading(false);
    }
  };

  // Step 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    const codeToVerify = otpCode.trim();
    if (!codeToVerify) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);

    try {
      const res = await verifyLoginOtp(challengeId, codeToVerify);
      if (res.success) {
        router.replace('/');
      } else {
        setError(res.error || 'Invalid verification code. Please try again.');
        setLoading(false);
      }
    } catch {
      setError('Verification failed. Please check network connection.');
      setLoading(false);
    }
  };

  // 1-Click Auto Fill OTP
  const handleAutoFillOtp = () => {
    if (!otpPreview) return;
    setOtpCode(otpPreview);
    setError('');
  };

  // Copy OTP to clipboard
  const handleCopyOtp = () => {
    if (!otpPreview) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(otpPreview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // WhatsApp Dispatch Helper
  const handleSendWhatsApp = () => {
    if (!otpPreview) return;
    const cleanPhone = (targetPhone || '').replace(/\D/g, '');
    const msg = encodeURIComponent(
      `*Showhouse Concept & Design Security Alert*\nYour 2-Step Login OTP is: *${otpPreview}*\nValid for 5 minutes. Do not share this code with anyone.`
    );
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${msg}`
      : `https://api.whatsapp.com/send?text=${msg}`;
    window.open(url, '_blank');
  };

  // Resend OTP code
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;
    setError('');
    setResending(true);

    try {
      const res = await resendLoginOtp(challengeId);
      if (res.success) {
        setOtpPreview(res.otp_preview || '');
        setTargetMasked(res.target_masked || targetMasked);
        setTargetPhone(res.phone || targetPhone);
        setSecondsLeft(res.expires_in_seconds || 300);
        setResendCooldown(30);
        setOtpCode('');
      } else {
        setError(res.error || 'Failed to resend code');
      }
    } catch {
      setError('Network error while requesting new verification code');
    } finally {
      setResending(false);
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!mounted) return null;

  // By default, display realistic 404 Not Found error until user taps/clicks 8 times
  if (!isUnlocked) {
    return <Stealth404Decoy onUnlock={handleUnlock} />;
  }

  // Once unlocked with 8 taps/clicks on error, display Showhouse Login Card
  return (
    <div className="min-h-screen bg-surface-950 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden select-none animate-in fade-in duration-300">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-[#b8860b]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-sm sm:max-w-md bg-surface-900 border border-surface-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative z-10 text-white animate-in zoom-in-95 duration-200">
        {/* Stealth Quick Lock / Hide button */}
        <button
          type="button"
          onClick={handleLockBack}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors cursor-pointer"
          title="Lock & Hide to 404"
        >
          <Lock size={15} />
        </button>

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
            <span>
              {step === 'otp' ? '2FA Two-Step Verification Active' : 'Secure Portal • Admin & Staff'}
            </span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/80 border border-red-800/80 text-red-200 text-xs flex items-start gap-2 animate-in fade-in">
            <ShieldAlert size={15} className="text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: CREDENTIALS (USERNAME + PASSWORD) */}
        {step === 'credentials' && (
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors p-0.5 cursor-pointer"
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
                  <span>Sign In & Request OTP</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: 2FA OTP VERIFICATION */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4 animate-in fade-in duration-200">
            {/* User & Terminal Info */}
            <div className="p-3 rounded-xl bg-surface-950/80 border border-surface-800 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-emerald-400 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Verification Code Sent</span>
              </div>
              <p className="text-xs text-surface-300">
                Signing in as <b className="text-white font-mono">{username}</b>
              </p>
              <p className="text-[11px] text-surface-400">
                Terminal ID: <span className="font-mono text-surface-300">{targetMasked}</span>
              </p>
            </div>

            {/* High-Tech Security Badge with 1-Click Auto-Fill */}
            {otpPreview && (
              <div className="p-3.5 rounded-xl bg-gradient-to-b from-amber-950/30 to-surface-950 border border-amber-500/40 space-y-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-amber-300/90 font-medium flex items-center gap-1">
                    <KeyRound size={13} className="text-amber-400" />
                    <span>Security OTP Token:</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleCopyOtp}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium text-surface-400 hover:text-white bg-surface-800/80 hover:bg-surface-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                      title="Copy code"
                    >
                      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* 6-Digit Code Preview */}
                <div className="flex items-center justify-center gap-2 py-1">
                  {otpPreview.split('').map((digit, i) => (
                    <div
                      key={i}
                      className="w-8 h-10 rounded-lg bg-surface-900 border border-amber-400/50 flex items-center justify-center text-lg font-black text-amber-300 font-mono shadow-inner shadow-black/50"
                    >
                      {digit}
                    </div>
                  ))}
                </div>

                {/* Action Buttons: 1-Click Auto Fill & WhatsApp dispatch */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAutoFillOtp}
                    className="py-1.5 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Check size={13} className="text-amber-300" />
                    <span>Auto-fill OTP</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="py-1.5 px-2.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-600/40 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    title="Send OTP to registered phone via WhatsApp"
                  >
                    <Smartphone size={13} className="text-emerald-400" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>
            )}

            {/* OTP Input Field */}
            <div>
              <label className="text-[11px] font-semibold text-surface-300 uppercase tracking-wider block mb-1.5">
                Enter 6-Digit Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={14}
                  autoFocus
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.toUpperCase())}
                  placeholder="••••••"
                  className="w-full bg-surface-950 border border-surface-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white rounded-lg px-3 py-2.5 text-center text-lg font-black font-mono tracking-[0.25em] outline-hidden transition-colors"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-surface-400 mt-1.5">
                <span>
                  Code expires in: <b className="text-amber-300 font-mono">{formatTimer(secondsLeft)}</b>
                </span>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || resending}
                  onClick={handleResendOtp}
                  className="text-primary-400 hover:text-primary-300 disabled:text-surface-600 font-semibold cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1"
                >
                  <RefreshCw size={11} className={resending ? 'animate-spin' : ''} />
                  <span>
                    {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend Code'}
                  </span>
                </button>
              </div>
            </div>

            {/* Submit Verification */}
            <button
              type="submit"
              disabled={loading || !otpCode.trim()}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-md shadow-emerald-950/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Verify Code & Enter Portal</span>
                </>
              )}
            </button>

            {/* Back button to re-enter credentials */}
            <div className="pt-2 flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  setStep('credentials');
                  setError('');
                }}
                className="text-[11px] text-surface-400 hover:text-surface-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>Switch Account / Re-enter Password</span>
              </button>
            </div>
          </form>
        )}

        {/* Footer info & Master emergency hint */}
        <div className="mt-6 pt-4 border-t border-surface-800 text-center space-y-1">
          <p className="text-[10px] text-surface-500">
            Showhouse Concept & Design LLP • Security Suite v2.0
          </p>
          {step === 'otp' && (
            <p className="text-[10px] text-surface-600">
              Emergency recovery bypass code <span className="font-mono text-surface-500">SH-SECURE-2026</span> supported.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
