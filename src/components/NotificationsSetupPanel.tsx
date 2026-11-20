import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  Download,
  PhoneIncoming,
  Send,
  ShieldAlert,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export interface PushControls {
  supported: boolean;
  permission: NotificationPermission;
  swReady: boolean;
  isSubscribed: boolean;
  subscriptionCount: number;
  busy: boolean;
  statusMessage: string | null;
  error: string | null;
  enableNotifications: () => Promise<boolean>;
  disableNotifications: () => Promise<void>;
  sendTestAlert: (kind: 'message' | 'call') => Promise<void>;
}

interface NotificationsSetupPanelProps {
  push: PushControls;
  username: string;
  onClose?: () => void;
  embedded?: boolean;
}

export const NotificationsSetupPanel: React.FC<NotificationsSetupPanelProps> = ({
  push,
  username,
  onClose,
  embedded = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const isReady = push.permission === 'granted' && push.isSubscribed;

  const permissionLabel =
    push.permission === 'granted'
      ? 'Allowed'
      : push.permission === 'denied'
        ? 'Blocked in browser'
        : 'Not requested yet';

  return (
    <div
      className={
        embedded
          ? 'w-full max-w-2xl mx-auto p-4 sm:p-8 space-y-6'
          : 'bg-white dark:bg-[#141D1A] rounded-2xl border border-[#E2E6E1] dark:border-[#24322D] p-5 sm:p-6 space-y-5 shadow-lg max-w-lg w-full'
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isReady ? (
              <CheckCircle2 className="w-5 h-5 text-[#0F766E] dark:text-[#5EEAD4]" aria-hidden="true" />
            ) : (
              <Bell className="w-5 h-5 text-[#0F766E] dark:text-[#5EEAD4]" aria-hidden="true" />
            )}
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Device Call &amp; Message Alerts
            </h2>
          </div>
          <p className="text-sm text-[#5B6862] dark:text-[#9AA8A1]">
            Configure push notifications for @{username} so incoming calls appear on your device even when Famy is closed.
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications setup"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#5B6862] hover:bg-[#EEF1EE] dark:hover:bg-[#1E2B27] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Clear 3-Step Setup State */}
      <div className="divide-y divide-[#E7EAE6] dark:divide-[#23302B] rounded-xl border border-[#E2E6E1] dark:border-[#24322D] bg-[#FAFBFA] dark:bg-[#101715]">
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">1. Background Service Worker</p>
            <p className="text-xs text-[#5B6862] dark:text-[#9AA8A1]">
              Listens for incoming call payloads while the app is closed
            </p>
          </div>
          <span
            className={`text-xs font-medium whitespace-nowrap ${
              push.swReady ? 'text-[#0F766E] dark:text-[#5EEAD4]' : 'text-[#6B7872]'
            }`}
          >
            {push.swReady ? 'Active' : 'Initializing'}
          </span>
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">2. Browser Notification Permission</p>
            <p className="text-xs text-[#5B6862] dark:text-[#9AA8A1]">
              Required by your OS and browser to show ring alerts
            </p>
          </div>
          <span
            className={`text-xs font-medium whitespace-nowrap ${
              push.permission === 'granted'
                ? 'text-[#0F766E] dark:text-[#5EEAD4]'
                : push.permission === 'denied'
                  ? 'text-[#DC2626] dark:text-[#FCA5A5]'
                  : 'text-[#B45309] dark:text-[#FCD34D]'
            }`}
          >
            {permissionLabel}
          </span>
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">3. Device Push Subscription</p>
            <p className="text-xs text-[#5B6862] dark:text-[#9AA8A1]">
              VAPID encrypted channel linked to @{username}
            </p>
          </div>
          <span className="text-xs font-medium tabular-nums whitespace-nowrap text-[#33413C] dark:text-[#CBD5D0]">
            {push.isSubscribed
              ? `Connected (${push.subscriptionCount} device${push.subscriptionCount === 1 ? '' : 's'})`
              : 'Not connected'}
          </span>
        </div>
      </div>

      {push.permission === 'denied' && (
        <div className="p-3.5 rounded-xl bg-[#FEF2F2] dark:bg-[#3B1518] border border-[#FECACA] dark:border-[#7F1D1D] flex items-start gap-2.5 text-sm text-[#B91C1C] dark:text-[#FCA5A5]">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Browser notifications are currently blocked. Open your browser site permissions next to the address bar, set Notifications to Allow, then click Retry Setup below.
          </p>
        </div>
      )}

      {push.error && push.permission !== 'denied' && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[#FEF2F2] dark:bg-[#3B1518] border border-[#FECACA] dark:border-[#7F1D1D] text-sm text-[#B91C1C] dark:text-[#FCA5A5]"
        >
          {push.error}
        </div>
      )}

      {push.statusMessage && (
        <div className="p-3.5 rounded-xl bg-[#ECFDF5] dark:bg-[#0F2E27] border border-[#A7F3D0] dark:border-[#115E59] text-sm text-[#065F46] dark:text-[#6EE7B7]">
          {push.statusMessage}
        </div>
      )}

      {/* Primary Action Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {!isReady ? (
          <button
            type="button"
            disabled={push.busy || !push.supported}
            onClick={() => void push.enableNotifications()}
            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0D655E] disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Bell className="w-4 h-4" aria-hidden="true" />
            <span>
              {push.busy
                ? 'Registering device...'
                : push.permission === 'denied'
                  ? 'Retry Notification Check'
                  : 'Enable Device Notifications'}
            </span>
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={push.busy}
              onClick={() => void push.sendTestAlert('call')}
              className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0D655E] disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              <PhoneIncoming className="w-4 h-4" aria-hidden="true" />
              <span>Test Call Alert</span>
            </button>
            <button
              type="button"
              disabled={push.busy}
              onClick={() => void push.sendTestAlert('message')}
              className="min-h-[46px] px-4 py-2.5 rounded-xl border border-[#DCE1DC] dark:border-[#273530] hover:bg-[#F2F4F2] dark:hover:bg-[#1E2B27] text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>Test Message</span>
            </button>
            <button
              type="button"
              disabled={push.busy}
              onClick={() => void push.disableNotifications()}
              className="min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#DCE1DC] dark:border-[#273530] hover:bg-[#FEF2F2] hover:text-[#B91C1C] dark:hover:bg-[#3B1518] text-sm font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <BellOff className="w-4 h-4" aria-hidden="true" />
              <span>Pause</span>
            </button>
          </>
        )}
      </div>

      {/* PWA Install Section */}
      {!isInstalled && (
        <div className="pt-4 border-t border-[#E7EAE6] dark:border-[#23302B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Smartphone className="w-4 h-4 text-[#0F766E] dark:text-[#5EEAD4] mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-xs text-[#5B6862] dark:text-[#9AA8A1]">
              <p className="font-medium text-[#111815] dark:text-[#F1F5F3]">
                Install Famy as an app
              </p>
              <p>
                {isIOS
                  ? 'On iPhone/iPad, install Famy to your Home Screen for background call notifications.'
                  : 'Run Famy in its own window and receive desktop or mobile push alerts reliably.'}
              </p>
            </div>
          </div>

          {isInstallable && (
            <button
              type="button"
              onClick={() => void install()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#111815] dark:bg-white text-white dark:text-[#111815] text-xs font-medium flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Install App</span>
            </button>
          )}

          {!isInstallable && isIOS && (
            <button
              type="button"
              onClick={() => setShowIOSGuide((v) => !v)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#DCE1DC] dark:border-[#273530] text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              How to Install on iOS
            </button>
          )}
        </div>
      )}

      {showIOSGuide && (
        <div className="p-3.5 rounded-xl bg-[#F2F4F2] dark:bg-[#192420] text-xs text-[#33413C] dark:text-[#CBD5D0] space-y-1">
          <p className="font-semibold">Install on iPhone or iPad:</p>
          <p>1. Tap the Share button in Safari.</p>
          <p>2. Scroll down and tap Add to Home Screen, then open Famy from your Home Screen.</p>
        </div>
      )}
    </div>
  );
};
