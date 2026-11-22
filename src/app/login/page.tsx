'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  ShieldAlert,
  KeyRound,
  Check,
  Copy,
  ArrowLeft,
  QrCode,
  Key,
  Shield,
  Download,
} from 'lucide-react';
import {
  loginAdmin,
  verifyTotpSetup,
  verifyLoginTotp,
  isAdminAuthenticated,
} from '@/lib/auth';
import { Stealth404Decoy } from '@/components/auth/stealth-404-decoy';

export default function LoginPage() {
  const router = useRouter();

  // Navigation & Step state: 'credentials' | 'totp_setup' | 'totp_backup_display' | 'totp'
  const [step, setStep] = useState<'credentials' | 'totp_setup' | 'totp_backup_display' | 'totp'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // 2FA Challenge & Setup state
  const [challengeId, setChallengeId] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [showManualKey, setShowManualKey] = useState(false);
  const [plainBackupCodes, setPlainBackupCodes] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  // 6-digit individual input boxes state
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Backup code mode during normal login
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCodeInput, setBackupCodeInput] = useState('');

  useEffect(() => {
    setMounted(true);

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
        document.title =
          step === 'totp_setup'
            ? 'Showhouse — Setup Authenticator'
            : step === 'totp'
            ? 'Showhouse — Two-Step Verification'
            : 'Showhouse — Login';
      } else {
        document.title = '404 - Page Not Found';
      }
    }
  }, [isUnlocked, mounted, step]);

  const handleUnlock = () => {
    setIsUnlocked(true);
  };

  const handleLockBack = () => {
    setIsUnlocked(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('sh_stealth_unlocked');
    }
  };

  // ----------------------------------------------------
  // Step 1: Submit Username & Password
  // ----------------------------------------------------
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
        setChallengeId(res.challenge_id || '');

        if (res.requires_totp_setup) {
          // Transition to Step 2: First-Time Authenticator Enrollment
          setQrCodeUrl(res.qr_code_url || '');
          setManualKey(res.manual_key || '');
          setPlainBackupCodes(res.plain_backup_codes || []);
          setDigits(['', '', '', '', '', '']);
          setStep('totp_setup');
          setLoading(false);
        } else if (res.requires_totp) {
          // Transition to Step 3: Normal 2FA Verification
          setDigits(['', '', '', '', '', '']);
          setUseBackupCode(false);
          setBackupCodeInput('');
          setStep('totp');
          setLoading(false);
        } else {
          router.replace('/');
        }
      } else {
        setError(res.error || 'Invalid credentials. Please check your username and password.');
        setLoading(false);
      }
    } catch {
      setError('Authentication failed. Please check network connection.');
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // Step 2: Verify Setup & Activate Authenticator
  // ----------------------------------------------------
  const handleActivateSetup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    const code = digits.join('').trim();
    if (code.length !== 6) {
      setError('Please enter all 6 digits from Google Authenticator');
      return;
    }

    setLoading(true);

    try {
      const res = await verifyTotpSetup(challengeId, code, username.trim());
      if (res.success) {
        if (res.plain_backup_codes && res.plain_backup_codes.length > 0) {
          setPlainBackupCodes(res.plain_backup_codes);
        }
        setStep('totp_backup_display');
        setLoading(false);
      } else {
        setError(res.error || 'Invalid verification code. Please check Google Authenticator.');
        setLoading(false);
      }
    } catch {
      setError('Verification failed. Please check network connection.');
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // Step 3: Verify 6-digit TOTP or Backup Code on Login
  // ----------------------------------------------------
  const handleVerifyLoginTotp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    let codeToVerify = '';
    if (useBackupCode) {
      codeToVerify = backupCodeInput.trim().toUpperCase();
      if (!codeToVerify) {
        setError('Please enter a valid backup code (e.g. XXXX-XXXX)');
        return;
      }
    } else {
      codeToVerify = digits.join('').trim();
      if (codeToVerify.length !== 6) {
        setError('Please enter the 6-digit code from Google Authenticator');
        return;
      }
    }

    setLoading(true);

    try {
      const res = await verifyLoginTotp(challengeId, codeToVerify);
      if (res.success) {
        router.replace('/');
      } else {
        setError(res.error || 'Invalid verification code. Please check Google Authenticator.');
        setLoading(false);
      }
    } catch {
      setError('Verification failed. Please check network connection.');
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // 6-Box OTP Input Management (Auto-Advance, Backspace, Paste)
  // ----------------------------------------------------
  const handleDigitChange = (index: number, val: string) => {
    // Only accept numeric digit
    const cleaned = val.replace(/\D/g, '');
    const newDigits = [...digits];

    if (cleaned.length > 1) {
      // Multiple characters pasted into single box
      const pasted = cleaned.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || '';
      }
      setDigits(newDigits);
      const nextIndex = Math.min(pasted.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newDigits[index] = cleaned;
    setDigits(newDigits);

    // Auto-advance
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Backspace to previous input
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasteData) return;

    const newDigits = [...digits];
    pasteData.split('').forEach((char, i) => {
      newDigits[i] = char;
    });
    setDigits(newDigits);

    const focusIdx = Math.min(pasteData.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  // Copy manual secret key
  const handleCopyManualKey = () => {
    if (!manualKey) return;
    navigator.clipboard.writeText(manualKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Copy all backup codes
  const handleCopyAllBackupCodes = () => {
    if (!plainBackupCodes.length) return;
    const text = `SHOWHOUSE EMERGENCY BACKUP CODES (Username: ${username})\n` +
      plainBackupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
      `\n\nEach code can be used once if you lose access to Google Authenticator. Store securely.`;
    navigator.clipboard.writeText(text);
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 2500);
  };

  if (!mounted) return null;

  // By default, display realistic 404 Not Found error until user unlocks
  if (!isUnlocked) {
    return <Stealth404Decoy onUnlock={handleUnlock} />;
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden select-none animate-in fade-in duration-300">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-[#b8860b]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login / 2FA Card */}
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
              {step === 'totp_setup'
                ? 'Google Authenticator Enrollment'
                : step === 'totp'
                ? 'Mandatory Two-Factor Authentication'
                : 'Secure Portal • Admin & Staff'}
            </span>
          </div>
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/80 border border-red-800/80 text-red-200 text-xs flex items-start gap-2 animate-in fade-in">
            <ShieldAlert size={15} className="text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 1: CREDENTIALS (USERNAME + PASSWORD)                */}
        {/* ======================================================== */}
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
                  placeholder="Enter username (admin or employee)"
                  className="w-full bg-surface-950 border border-surface-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white rounded-lg pl-9 pr-3 py-2.5 text-xs outline-hidden transition-colors"
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
                  className="w-full bg-surface-950 border border-surface-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white rounded-lg pl-9 pr-10 py-2.5 text-xs outline-hidden transition-colors font-mono"
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
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs shadow-md shadow-amber-900/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
        )}

        {/* ======================================================== */}
        {/* STEP 2: AUTHENTICATOR ENROLLMENT (FIRST LOGIN)           */}
        {/* ======================================================== */}
        {step === 'totp_setup' && (
          <form onSubmit={handleActivateSetup} className="space-y-4 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <h2 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                <Shield size={16} className="text-amber-400" />
                <span>Secure Your Showhouse Account</span>
              </h2>
              <p className="text-[11px] text-surface-300 leading-relaxed">
                Scan this QR code using <b>Google Authenticator</b> on your Android or iPhone device.
              </p>
            </div>

            {/* QR Code Container */}
            <div className="p-3 bg-surface-950 rounded-xl border border-surface-800 text-center space-y-2.5">
              {qrCodeUrl ? (
                <div className="w-44 h-44 sm:w-48 sm:h-48 mx-auto bg-white p-2 rounded-xl shadow-inner flex items-center justify-center border border-amber-300/40">
                  <img
                    src={qrCodeUrl}
                    alt="Google Authenticator QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-44 h-44 mx-auto flex items-center justify-center text-xs text-surface-400">
                  Loading QR Code...
                </div>
              )}

              {/* Manual Setup Key Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowManualKey(!showManualKey)}
                  className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Key size={12} />
                  <span>{showManualKey ? 'Hide Manual Key' : "Can't scan? View Manual Key"}</span>
                </button>

                {showManualKey && (
                  <div className="mt-2 p-2 bg-surface-900 border border-surface-700 rounded-lg text-left space-y-1">
                    <span className="text-[10px] text-surface-400 uppercase font-bold tracking-wider block">
                      Account: Showhouse ({username})
                    </span>
                    <div className="flex items-center justify-between gap-1 bg-surface-950 px-2 py-1.5 rounded border border-surface-800">
                      <code className="font-mono text-xs text-amber-300 break-all select-all">
                        {manualKey}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyManualKey}
                        className="text-surface-400 hover:text-white p-1 rounded shrink-0 cursor-pointer"
                        title="Copy key"
                      >
                        {copiedKey ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      </button>
                    </div>
                    <span className="text-[9px] text-surface-500 block">
                      Type: Time-based (TOTP) • Digits: 6
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 6-Digit Code Input */}
            <div>
              <label className="text-[11px] font-semibold text-surface-300 uppercase tracking-wider block mb-2 text-center">
                Enter 6-Digit Code from App
              </label>
              <div className="flex items-center justify-center gap-2">
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { inputRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                    onPaste={idx === 0 ? handleDigitPaste : undefined}
                    className="w-10 h-12 sm:w-11 sm:h-12 text-center text-xl font-bold font-mono rounded-lg bg-surface-950 border border-surface-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white outline-hidden transition-all shadow-inner"
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || digits.join('').length !== 6}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-md shadow-emerald-950/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ShieldCheck size={15} />
                  <span>Activate Authenticator</span>
                </>
              )}
            </button>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => {
                  setStep('credentials');
                  setError('');
                }}
                className="text-[11px] text-surface-400 hover:text-surface-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={12} />
                <span>Back to Login</span>
              </button>
            </div>
          </form>
        )}

        {/* ======================================================== */}
        {/* STEP 2B: DISPLAY BACKUP CODES AFTER ACTIVATION           */}
        {/* ======================================================== */}
        {step === 'totp_backup_display' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <div className="w-10 h-10 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center">
                <Check size={20} className="stroke-[2.5]" />
              </div>
              <h2 className="text-sm font-bold text-white">Google Authenticator Activated!</h2>
              <p className="text-[11px] text-surface-300 leading-relaxed">
                Save your <b>10 Emergency Backup Codes</b> now. If you ever lose your phone, each code can be used once to sign in.
              </p>
            </div>

            {/* 10 Backup Codes in 2-Column Grid */}
            <div className="p-3.5 bg-surface-950 rounded-xl border border-amber-500/30 space-y-2.5">
              <div className="grid grid-cols-2 gap-2 text-center font-mono text-xs font-bold text-amber-300">
                {plainBackupCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="py-1.5 px-2 bg-surface-900 border border-surface-800 rounded-md tracking-wider select-all"
                  >
                    <span className="text-[10px] text-surface-500 mr-1.5">{idx + 1}.</span>
                    <span>{code}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCopyAllBackupCodes}
                className="w-full py-1.5 px-3 rounded-lg bg-surface-800 hover:bg-surface-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-surface-700"
              >
                {copiedBackup ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copiedBackup ? 'All 10 Codes Copied to Clipboard!' : 'Copy All Backup Codes'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => router.replace('/')}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs shadow-md shadow-amber-900/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>I Have Saved My Codes → Proceed to Dashboard</span>
              <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 3: NORMAL 2FA LOGIN (EVERY SUBSEQUENT LOGIN)        */}
        {/* ======================================================== */}
        {step === 'totp' && (
          <form onSubmit={handleVerifyLoginTotp} className="space-y-4 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <h2 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                <KeyRound size={16} className="text-amber-400" />
                <span>Two-Step Verification</span>
              </h2>
              <p className="text-[11px] text-surface-300 leading-relaxed">
                {useBackupCode
                  ? 'Enter one of your 8-character single-use emergency backup codes.'
                  : 'Open Google Authenticator on your phone and enter your 6-digit code.'}
              </p>
              <div className="text-[10px] text-surface-400 font-mono">
                Signing in as <b className="text-white">{username}</b>
              </div>
            </div>

            {/* Standard 6-Digit Individual Input Boxes */}
            {!useBackupCode ? (
              <div>
                <label className="text-[11px] font-semibold text-surface-300 uppercase tracking-wider block mb-2 text-center">
                  6-Digit Authenticator Code
                </label>
                <div className="flex items-center justify-center gap-2">
                  {digits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => { inputRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      autoFocus={idx === 0}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                      onPaste={idx === 0 ? handleDigitPaste : undefined}
                      className="w-10 h-12 sm:w-11 sm:h-12 text-center text-xl font-bold font-mono rounded-lg bg-surface-950 border border-surface-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white outline-hidden transition-all shadow-inner"
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Emergency Backup Code Input */
              <div>
                <label className="text-[11px] font-semibold text-surface-300 uppercase tracking-wider block mb-1.5 text-center">
                  Emergency Backup Code
                </label>
                <input
                  type="text"
                  autoFocus
                  maxLength={12}
                  value={backupCodeInput}
                  onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2-C3D4"
                  className="w-full bg-surface-950 border border-surface-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white rounded-lg px-3 py-2.5 text-center text-sm font-bold font-mono tracking-widest outline-hidden transition-colors"
                />
              </div>
            )}

            {/* Submit Verification Button */}
            <button
              type="submit"
              disabled={loading || (useBackupCode ? !backupCodeInput.trim() : digits.join('').length !== 6)}
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

            {/* Toggle Backup Code vs Normal TOTP */}
            <div className="flex items-center justify-between pt-1 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setError('');
                }}
                className="text-amber-400 hover:text-amber-300 transition-colors cursor-pointer font-medium"
              >
                {useBackupCode ? 'Use Google Authenticator OTP instead' : 'Lost phone? Use a backup code'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('credentials');
                  setError('');
                }}
                className="text-surface-400 hover:text-surface-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={11} />
                <span>Back to Login</span>
              </button>
            </div>
          </form>
        )}

        {/* Card Footer */}
        <div className="mt-6 pt-4 border-t border-surface-800 text-center space-y-1">
          <p className="text-[10px] text-surface-500">
            Showhouse Concept & Design LLP • Google Authenticator 2FA Active
          </p>
          <p className="text-[9px] text-surface-600">
            Zero recurring SMS costs • Mandatory RFC 6238 TOTP Protection
          </p>
        </div>
      </div>
    </div>
  );
}
