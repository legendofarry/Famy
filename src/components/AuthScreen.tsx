import React, { useState } from 'react';
import { BellRing, MessageSquare, PhoneCall, Video } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { api, setStoredToken } from '../lib/api';
import { firebaseAuth, googleAuthProvider } from '../lib/firebase';
import type { UserPublic } from '../shared/types';

interface AuthScreenProps {
  onAuthenticated: (user: UserPublic) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const credential = await signInWithPopup(firebaseAuth, googleAuthProvider);
      const idToken = await credential.user.getIdToken();
      const res = await api.firebaseSignin(idToken);
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
            Start chatting and calling with secure Google sign-in. Your Famy profile activates the moment you join.
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
              Welcome to Famy
            </h2>
            <p className="text-sm text-[#5B6862] dark:text-[#9AA8A1]">
              Sign in with Google to chat, call, and share moments.
            </p>
          </div>

          <div className="space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[#FEF2F2] dark:bg-[#3B1518] border border-[#FECACA] dark:border-[#7F1D1D] text-sm text-[#B91C1C] dark:text-[#FCA5A5]"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-white dark:bg-[#141D1A] border border-[#DCE1DC] dark:border-[#273530] hover:bg-[#F7F8F7] dark:hover:bg-[#1A2521] disabled:opacity-60 text-[#111815] dark:text-white font-medium text-sm flex items-center justify-center gap-3 transition-colors cursor-pointer"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-sm font-bold text-[#4285F4] border border-[#DCE1DC]">G</span>
              <span>{submitting ? 'Signing in...' : 'Continue with Google'}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
