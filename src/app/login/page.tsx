"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { acceptCollaborationInvite } from '@/lib/collaborations';
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
  MailCheck,
  Users,
  Download
} from 'lucide-react';
import toast from 'react-hot-toast';

type AuthMode = 'signin' | 'signup' | 'forgot';

function LoginForm() {
  const searchParams = useSearchParams();
  const urlInviteToken = searchParams?.get('invite') || '';
  const initialMode = searchParams?.get('mode') === 'signup' ? 'signup' : 'signin';
  const shouldSwitch = searchParams?.get('switch') === 'true';

  const [mode, setMode] = useState<AuthMode>(initialMode);
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

  // Store invite token in localStorage so it persists through email confirmations
  useEffect(() => {
    if (urlInviteToken && typeof window !== 'undefined') {
      localStorage.setItem('pending_invite_token', urlInviteToken);
    }
  }, [urlInviteToken]);

  // If user navigated here with ?switch=true, log them out first so they can sign in with another account
  useEffect(() => {
    if (shouldSwitch) {
      supabase.auth.signOut();
    }
  }, [shouldSwitch, supabase]);

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
    return { message: errMsg };
  };

  const checkAndAcceptPendingInvite = async () => {
    const pendingToken = urlInviteToken || (typeof window !== 'undefined' ? localStorage.getItem('pending_invite_token') : null);
    if (!pendingToken) {
      router.push('/');
      router.refresh();
      return;
    }

    try {
      const res = await acceptCollaborationInvite(pendingToken);
      if (typeof window !== 'undefined') localStorage.removeItem('pending_invite_token');

      if (res.success) {
        toast.success(`Welcome! You are now collaborating on "${res.title || 'the note'}"`);
        if (res.page_id) {
          router.push(`/?pageId=${res.page_id}`);
        } else if (res.notebook_id) {
          router.push(`/?notebookId=${res.notebook_id}`);
        } else {
          router.push('/');
        }
        router.refresh();
        return;
      }
    } catch (e) {
      console.warn('Could not auto-accept invite upon login:', e);
    }

    router.push('/');
    router.refresh();
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
          await checkAndAcceptPendingInvite();
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
          await checkAndAcceptPendingInvite();
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
    if (!confirmationSentTo || resendCooldown > 0) return;
    setLoading(true);
    setError(null);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: confirmationSentTo,
      });

      if (resendError) {
        setError(translateSupabaseError(resendError.message, 'signup'));
      } else {
        setSuccessMessage('A new confirmation email has been sent! Please check your inbox and spam folder.');
        setResendCooldown(60);
      }
    } catch (err: any) {
      setError({ message: err?.message || 'Could not resend email. Please try again later.' });
    } finally {
      setLoading(false);
    }
  };

  const hasInvite = Boolean(urlInviteToken || (typeof window !== 'undefined' && localStorage.getItem('pending_invite_token')));

  // --- SCREEN 1: CONFIRMATION LINK SENT ---
  if (confirmationSentTo) {
    return (
      <div className="flex w-full min-h-screen items-center justify-center bg-zinc-950 p-4">
        <div className="w-full max-w-[420px] rounded-2xl border border-zinc-800/90 bg-zinc-900/90 backdrop-blur-xl p-7 sm:p-8 shadow-2xl space-y-6 text-center">
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
            <img src="/logo.png" alt="Motif" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Motif</h1>
          <p className="text-xs text-zinc-400">
            {mode === 'signin' && 'Sign in to access your spatial workspace'}
            {mode === 'signup' && 'Create your account to get started in seconds'}
            {mode === 'forgot' && 'Reset your account password'}
          </p>
        </div>

        {/* Invite Notification Banner */}
        {hasInvite && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary-950/60 border border-primary-500/40 text-xs text-primary-300 animate-in fade-in">
            <Users size={16} className="text-primary-400 shrink-0" />
            <span>
              You have a pending collaboration invite! Sign in or create an account to start collaborating.
            </span>
          </div>
        )}

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
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span>Email Address</span>
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                required
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
              />
            </div>
          </div>

          {/* Password Field */}
          {mode !== 'forgot' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-primary-400 hover:text-primary-300 hover:underline transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Error Message Box with Action Pill */}
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                <span>{error.message}</span>
              </div>
              {error.action && (
                <button
                  type="button"
                  onClick={() => switchMode(error.action === 'switch_to_signup' ? 'signup' : 'signin')}
                  className="inline-flex items-center gap-1 font-semibold text-primary-400 hover:text-primary-300 underline"
                >
                  {error.action === 'switch_to_signup' ? 'Click here to create an account' : 'Click here to sign in'}
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-primary-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin text-white" />
            ) : (
              <>
                <span>
                  {mode === 'signin' && (hasInvite ? 'Sign In & Accept Invite' : 'Sign In')}
                  {mode === 'signup' && (hasInvite ? 'Create Account & Join Note' : 'Create Free Account')}
                  {mode === 'forgot' && 'Send Reset Instructions'}
                </span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer Note */}
        <div className="text-center pt-2 border-t border-zinc-800/80">
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

        {/* Android App Download Link */}
        <div className="mt-5 text-center">
          <a
            href="/Motif.apk"
            download="Motif.apk"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 rounded-full transition-colors shadow-xs"
          >
            <Download size={13} className="text-primary-400" />
            <span>Download Android App (.apk)</span>
          </a>
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex w-full min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 size={28} className="animate-spin text-primary-500" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
