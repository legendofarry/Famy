import React, { useState } from 'react';
import { BellRing, MessageSquare, PhoneCall, Video } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { api, setStoredToken } from '../lib/api';
import { firebaseAuth } from '../lib/firebase';
import type { UserPublic } from '../shared/types';

interface AuthScreenProps {
  onAuthenticated: (user: UserPublic) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      const credential =
        mode === 'signup'
          ? await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password)
          : await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);

      if (mode === 'signup') {
        try {
          await sendEmailVerification(credential.user);
        } catch (verificationError: unknown) {
          await signOut(firebaseAuth);
          setMode('signin');
          throw new Error(
            `Your account was created, but we couldn't send the verification email. ${getAuthErrorMessage(verificationError)}`
          );
        }

        await signOut(firebaseAuth);
        setMode('signin');
        setNotice(`We sent a verification link to ${email.trim()}. Verify your email, then sign in.`);
        return;
      }

      if (!credential.user.emailVerified) {
        try {
          await sendEmailVerification(credential.user);
        } finally {
          await signOut(firebaseAuth);
        }
        setNotice(`Your email isn't verified yet. We sent a new verification link to ${email.trim()}.`);
        return;
      }

      const idToken = await credential.user.getIdToken(true);
      const res = await api.firebaseSignin(idToken);
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const authHeading = mode === 'signup' ? 'Create your account' : 'Welcome back';

  return (
    <div className="min-h-screen w-full bg-[#F6F7F5] dark:bg-[#0B110F] text-[#111815] dark:text-[#F1F5F3] flex flex-col lg:grid lg:grid-cols-12">
      {/* Left Brand Showcase (Desktop) */}
      <section className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between p-12 xl:p-16 bg-[#0F766E] text-white relative overflow-hidden">
        <div className="flex items-center gap-3">
          <img
            src="/icon.svg"
            alt="Famy logo"
            className="w-10 h-10 rounded-xl shadow-sm"
            referrerPolicy="no-referrer"
          />
          <span className="font-display text-2xl font-semibold tracking-tight">Famy</span>
        </div>

        <div className="max-w-xl my-auto space-y-8">
          <h1 className="font-display text-4xl xl:text-5xl font-semibold tracking-tight leading-[1.12] [text-wrap:balance]">
            Direct calls, shared moments, and instant alerts on every device.
          </h1>
          <p className="text-base xl:text-lg text-white/85 leading-relaxed max-w-lg">
            Create an account with your email and password. Verify your email to start chatting and calling.
          </p>

          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-white/15">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <PhoneCall className="w-4 h-4 text-[#99F6E4]" aria-hidden="true" />
                <span>Voice &amp; Video Calls</span>
              </div>
              <p className="text-sm text-white/75">
                Peer-to-peer WebRTC calling with live audio and camera controls.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <BellRing className="w-4 h-4 text-[#99F6E4]" aria-hidden="true" />
                <span>Background Push Alerts</span>
              </div>
              <p className="text-sm text-white/75">
                Receive incoming call notifications even when Famy is closed.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <MessageSquare className="w-4 h-4 text-[#99F6E4]" aria-hidden="true" />
                <span>Media &amp; Rich Links</span>
              </div>
              <p className="text-sm text-white/75">
                Share photos, videos, and links with automatic preview cards.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Video className="w-4 h-4 text-[#99F6E4]" aria-hidden="true" />
                <span>Mobile &amp; Desktop PWA</span>
              </div>
              <p className="text-sm text-white/75">
                Install Famy directly to your home screen or desktop dock.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-white/70">
          Email-verified accounts · Private messaging · Real-time calls &amp; alerts
        </p>
      </section>

      {/* Right Auth Form */}
      <main className="flex-1 lg:col-span-6 xl:col-span-5 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-7">
          <div className="flex items-center gap-3 lg:hidden">
            <img
              src="/icon.svg"
              alt="Famy logo"
              className="w-10 h-10 rounded-xl"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="font-display text-2xl font-semibold tracking-tight block leading-none">
                Famy
              </span>
              <span className="text-xs text-[#5B6862] dark:text-[#9AA8A1]">
                Private messaging &amp; calls
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-3xl font-semibold tracking-tight [text-wrap:balance]">
              {authHeading}
            </h2>
            <p className="text-sm text-[#5B6862] dark:text-[#9AA8A1]">
              {mode === 'signup'
                ? 'Sign up with your email address and create a password.'
                : 'Sign in with your email and password. Email verification is required.'}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Account mode"
            className="grid grid-cols-2 gap-1 p-1 bg-[#EAECE9] dark:bg-[#17211D] rounded-xl"
          >
            {(['signup', 'signin'] as const).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                role="tab"
                aria-selected={mode === nextMode}
                onClick={() => {
                  setMode(nextMode);
                  setError(null);
                  setNotice(null);
                }}
                className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === nextMode
                    ? 'bg-white dark:bg-[#23312B] text-[#111815] dark:text-white shadow-xs'
                    : 'text-[#5B6862] dark:text-[#9AA8A1] hover:text-[#111815] dark:hover:text-white'
                }`}
              >
                {nextMode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {notice && (
              <div
                role="status"
                className="p-3 rounded-xl bg-[#ECFDF5] dark:bg-[#12312A] border border-[#A7F3D0] dark:border-[#166534] text-sm text-[#047857] dark:text-[#6EE7B7]"
              >
                {notice}
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[#FEF2F2] dark:bg-[#3B1518] border border-[#FECACA] dark:border-[#7F1D1D] text-sm text-[#B91C1C] dark:text-[#FCA5A5]"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="famy-email" className="block text-sm font-medium">
                  Email
                </label>
                <input
                  id="famy-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white dark:bg-[#141D1A] border border-[#DCE1DC] dark:border-[#273530] text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:border-transparent transition"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="famy-password" className="block text-sm font-medium">
                  Password
                </label>
                <input
                  id="famy-password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={6}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white dark:bg-[#141D1A] border border-[#DCE1DC] dark:border-[#273530] text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:border-transparent transition"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0F766E] hover:bg-[#0D655E] disabled:opacity-60 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {submitting
                  ? mode === 'signup'
                    ? 'Creating account...'
                    : 'Signing in...'
                  : mode === 'signup'
                    ? 'Create Account'
                    : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

function getAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'An account already exists for this email. Try signing in.';
      case 'auth/invalid-credential':
        return 'Email or password is incorrect.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/weak-password':
        return 'Choose a password with at least 6 characters.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a while and try again.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Unable to authenticate.';
}
