"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  BookOpen,
  ArrowLeft,
  MailCheck
} from 'lucide-react';

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [error, setError] = useState<{ message: string; action?: 'switch_to_signin' | 'switch_to_signup' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Dedicated check-email screen for signups requiring confirmation
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const router = useRouter();
  const [supabase] = useState(() => createClient());

  // Handle countdown for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Clear errors when changing modes
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccessMessage(null);
  };

  const validateInputs = (): boolean => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError({ message: 'Please enter your email address.' });
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError({ message: 'Please enter a valid email address.' });
      return false;
    }
    if (mode !== 'forgot') {
      if (!password) {
        setError({ message: 'Please enter your password.' });
        return false;
      }
      if (mode === 'signup' && password.length < 6) {
        setError({ message: 'Password must be at least 6 characters.' });
        return false;
      }
    }
    return true;
  };

  const translateSupabaseError = (errMsg: string, currentMode: AuthMode): { message: string; action?: 'switch_to_signin' | 'switch_to_signup' } => {
    const lower = errMsg.toLowerCase();
    
    if (lower.includes('anonymous sign-ins are disabled') || lower.includes('anonymous')) {
      return { message: 'Please enter both an email and password to proceed.' };
    }
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
      return { 
        message: 'Incorrect email or password. If you do not have an account yet, create one below.',
        action: 'switch_to_signup'
      };
    }
    if (lower.includes('user already registered') || lower.includes('already exists')) {
      return { 
        message: 'An account with this email already exists. Please sign in instead.',
        action: 'switch_to_signin'
      };
    }
    if (lower.includes('email rate limit') || lower.includes('over_email_send_rate_limit') || lower.includes('too many requests')) {
      return { 
        message: 'Too many requests. Please wait a couple minutes before trying again, or check your email for a previous confirmation link.'
      };
    }
    if (lower.includes('email not confirmed')) {
      return { 
        message: 'Please check your email inbox to confirm your account before signing in.'
      };
    }
    if (lower.includes('password should be at least')) {
      return { message: 'Password must be at least 6 characters.' };
    }

    return { message: errMsg };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;

    const trimmedEmail = email.trim();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (signInError) {
          setError(translateSupabaseError(signInError.message, 'signin'));
          setLoading(false);
        } else {
          router.push('/');
          router.refresh();
        }
      } else if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });

        if (signUpError) {
          setError(translateSupabaseError(signUpError.message, 'signup'));
          setLoading(false);
        } else if (data?.session) {
          // Email confirmation was disabled — logged in immediately!
          router.push('/');
          router.refresh();
        } else {
          // Email confirmation is required
          setConfirmationSentTo(trimmedEmail);
          setResendCooldown(60);
          setLoading(false);
        }
      } else if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
        });

        if (resetError) {
          setError(translateSupabaseError(resetError.message, 'forgot'));
        } else {
          setSuccessMessage('Password reset link sent! Check your inbox for instructions.');
        }
        setLoading(false);
      }
    } catch (err: any) {
      setError({ message: err?.message || 'An unexpected error occurred. Please try again.' });
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (resendCooldown > 0 || !confirmationSentTo) return;
    setLoading(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: confirmationSentTo,
      });
      if (resendError) {
        setError(translateSupabaseError(resendError.message, 'signup'));
      } else {
        setResendCooldown(60);
        setSuccessMessage('New confirmation email sent!');
      }
    } catch (err: any) {
      setError({ message: 'Unable to resend email right now. Please wait a moment.' });
    } finally {
      setLoading(false);
    }
  };

  // --- SCREEN 1: CONFIRMATION EMAIL SENT SCREEN ---
  if (confirmationSentTo) {
    return (
      <div className="flex w-full min-h-screen items-center justify-center bg-zinc-950 p-4 select-none">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/90 backdrop-blur-xl p-8 shadow-2xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
          
          <div className="w-16 h-16 rounded-2xl bg-primary-950/60 border border-primary-500/30 text-primary-400 flex items-center justify-center mx-auto shadow-lg">
            <MailCheck size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Check your email</h2>
            <p className="text-sm text-zinc-300">
              We sent a confirmation link to:
            </p>
            <div className="inline-block px-3 py-1 bg-zinc-800/80 border border-zinc-700/60 rounded-lg text-sm font-semibold text-primary-400">
              {confirmationSentTo}
            </div>
            <p className="text-xs text-zinc-400 pt-2 leading-relaxed">
              Click the link in the email to activate your account. Be sure to check your <strong>Spam</strong> or <strong>Junk</strong> folder if you don&apos;t see it within a minute.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2 text-left">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2 text-left">
              <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="space-y-3 pt-3">
            <button
              type="button"
              onClick={() => {
                setConfirmationSentTo(null);
                switchMode('signin');
              }}
              className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-semibold text-sm shadow-md transition-colors"
            >
              Back to Sign In
            </button>

            <button
              type="button"
              disabled={resendCooldown > 0 || loading}
              onClick={handleResendConfirmation}
              className="w-full py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
            >
              {resendCooldown > 0 ? `Resend email in ${resendCooldown}s` : 'Didn&apos;t get the email? Resend'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- SCREEN 2: MAIN AUTH FORM (SIGN IN / CREATE ACCOUNT / FORGOT) ---
  return (
    <div className="flex w-full min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-zinc-800/90 bg-zinc-900/90 backdrop-blur-xl p-7 sm:p-8 shadow-2xl space-y-6">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-16 h-16 mb-1 flex items-center justify-center">
            <img src="/logo.png" alt="CubNotes" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CubNotes</h1>
          <p className="text-xs text-zinc-400">
            {mode === 'signin' && 'Sign in to access your spatial workspace'}
            {mode === 'signup' && 'Create your account to get started in seconds'}
            {mode === 'forgot' && 'Reset your account password'}
          </p>
        </div>

        {/* Segmented Pill Tabs (Sign In vs Create Account) */}
        {mode !== 'forgot' && (
          <div className="grid grid-cols-2 p-1 bg-zinc-950/80 border border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Back to Sign In button when in Forgot Password mode */}
        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-primary-400 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Sign In</span>
          </button>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Email Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-300">
              Email Address
            </label>
            <div className="relative flex items-center">
              <Mail size={16} className="absolute left-3.5 text-zinc-500 pointer-events-none" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/90 pl-10 pr-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all"
                required
              />
            </div>
          </div>

          {/* Password Field (Only for Sign In & Sign Up) */}
          {mode !== 'forgot' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-zinc-300">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              
              <div className="relative flex items-center">
                <Lock size={16} className="absolute left-3.5 text-zinc-500 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/90 pl-10 pr-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {mode === 'signup' && (
                <p className="text-[11px] text-zinc-500">
                  Must be at least 6 characters long.
                </p>
              )}
            </div>
          )}

          {/* Error Message Box */}
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300 space-y-1.5 animate-in fade-in duration-150">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error.message}</span>
              </div>
              {error.action === 'switch_to_signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-primary-400 font-semibold underline pl-6 hover:text-primary-300 block text-left"
                >
                  👉 Switch to Sign In
                </button>
              )}
              {error.action === 'switch_to_signup' && (
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="text-primary-400 font-semibold underline pl-6 hover:text-primary-300 block text-left"
                >
                  👉 Create Account instead
                </button>
              )}
            </div>
          )}

          {/* Success Message Box */}
          {successMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in duration-150">
              <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Single Primary Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold text-sm shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>
                    {mode === 'signin' && 'Sign In'}
                    {mode === 'signup' && 'Create Account'}
                    {mode === 'forgot' && 'Send Reset Link'}
                  </span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer Mode Switcher */}
        <div className="pt-2 text-center border-t border-zinc-800/80">
          {mode === 'signin' ? (
            <p className="text-xs text-zinc-400">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-bold text-primary-400 hover:underline inline-block"
              >
                Create one now
              </button>
            </p>
          ) : mode === 'signup' ? (
            <p className="text-xs text-zinc-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-bold text-primary-400 hover:underline inline-block"
              >
                Sign In
              </button>
            </p>
          ) : (
            <p className="text-xs text-zinc-400">
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-bold text-primary-400 hover:underline inline-block"
              >
                Sign In
              </button>
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
