import React, { useState } from 'react';
import { ArrowRight, BellRing, Download, Lock, MessageSquare, PhoneCall, Video } from 'lucide-react';
import { api, setStoredToken } from '../lib/api';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { UserPublic } from '../shared/types';
import { validatePassword, validateUsername } from '../shared/validation';

interface AuthScreenProps {
  onAuthenticated: (user: UserPublic) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const uCheck = validateUsername(username);
    if (!uCheck.ok) {
      setError(uCheck.error || 'Enter a valid username.');
      return;
    }

    const pCheck = validatePassword(password);
    if (!pCheck.ok) {
      setError(pCheck.error || 'Enter a valid password.');
      return;
    }

    setSubmitting(true);
    try {
      const res =
        mode === 'signup'
          ? await api.signup(uCheck.normalized, password)
          : await api.signin(uCheck.normalized, password);
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

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
            Start chatting and calling with just a unique username. No email address, no waiting — your account activates the second you join.
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
          Username-only identity · Instant activation · Real-time WebSocket &amp; Web Push
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
              {mode === 'signup' ? 'Claim your username' : 'Welcome back'}
            </h2>
            <p className="text-sm text-[#5B6862] dark:text-[#9AA8A1]">
              {mode === 'signup'
                ? 'Choose a unique username and password. No email required — active immediately.'
                : 'Sign in with your Famy username and password.'}
            </p>
          </div>

          {!isInstalled && (
            <section className="flex items-center gap-3 rounded-2xl border border-[#DCE1DC] dark:border-[#273530] bg-white/70 dark:bg-[#141D1A] p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E6F4F1] dark:bg-[#173A35] text-[#0F766E]">
                <Download className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Get Famy on your device</p>
                <p className="text-xs text-[#5B6862] dark:text-[#9AA8A1]">
                  {isInstallable
                    ? 'Install for a full-screen app experience and quick access.'
                    : isIOS
                      ? 'Use Share, then “Add to Home Screen”.'
                      : 'Use your browser menu to install or add Famy to your home screen.'}
                </p>
              </div>
              {isInstallable && (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="min-h-10 shrink-0 rounded-xl bg-[#0F766E] px-3 text-sm font-medium text-white hover:bg-[#0D655E]"
                >
                  Install
                </button>
              )}
            </section>
          )}

          {/* Segmented Switch */}
          <div
            role="tablist"
            aria-label="Account mode"
            className="grid grid-cols-2 gap-1 p-1 bg-[#EAECE9] dark:bg-[#17211D] rounded-xl"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white dark:bg-[#23312B] text-[#111815] dark:text-white shadow-xs'
                  : 'text-[#5B6862] dark:text-[#9AA8A1] hover:text-[#111815] dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'signin'
                  ? 'bg-white dark:bg-[#23312B] text-[#111815] dark:text-white shadow-xs'
                  : 'text-[#5B6862] dark:text-[#9AA8A1] hover:text-[#111815] dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="famy-username" className="block text-sm font-medium">
                Username
              </label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7872] font-medium select-none"
                >
                  @
                </span>
                <input
                  id="famy-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your_username"
                  className="w-full min-h-[46px] pl-8 pr-4 py-2.5 rounded-xl bg-white dark:bg-[#141D1A] border border-[#DCE1DC] dark:border-[#273530] text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:border-transparent transition"
                />
              </div>
              <p className="text-xs text-[#6B7872] dark:text-[#8E9C95]">
                3–24 characters · letters, numbers, underscores only
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="famy-password" className="block text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7872]"
                />
                <input
                  id="famy-password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-[#141D1A] border border-[#DCE1DC] dark:border-[#273530] text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:border-transparent transition"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[#FEF2F2] dark:bg-[#3B1518] border border-[#FECACA] dark:border-[#7F1D1D] text-sm text-[#B91C1C] dark:text-[#FCA5A5]"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0F766E] hover:bg-[#0D655E] disabled:opacity-60 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>
                {submitting
                  ? mode === 'signup'
                    ? 'Creating account...'
                    : 'Signing in...'
                  : mode === 'signup'
                    ? 'Create Account & Start'
                    : 'Sign In to Famy'}
              </span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>

        </div>
      </main>
    </div>
  );
};
