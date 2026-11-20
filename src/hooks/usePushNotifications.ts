import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { api } from '../lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(isAuthenticated: boolean) {
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [swReady, setSwReady] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    if (!supported) return;
    setPermission(Notification.permission);

    try {
      const reg = await navigator.serviceWorker.ready;
      setSwReady(true);
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(Boolean(sub));

      if (isAuthenticated) {
        const status = await api.getPushStatus();
        setSubscriptionCount(status.subscriptionCount);
        if (sub && Notification.permission === 'granted' && status.subscriptionCount === 0) {
          const res = await api.subscribePush(sub.toJSON());
          setSubscriptionCount(res.subscriptionCount);
        }
      }
    } catch {
      // Service worker may not be active in restricted contexts
    }
  }, [isAuthenticated, supported]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    registerSW({
      immediate: true,
      onRegisteredSW() {
        setSwReady(true);
      },
      onRegisterError() {
        setSwReady(false);
      },
    });
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const enableNotifications = useCallback(async () => {
    setError(null);
    setStatusMessage(null);

    if (!supported) {
      setError('This browser does not support Web Push notifications.');
      return false;
    }

    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setError(
          perm === 'denied'
            ? 'Notifications are blocked in browser site settings. Allow notifications for this site to receive incoming calls.'
            : 'Notification permission was dismissed.'
        );
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      setSwReady(true);

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const { publicKey } = await api.getVapidPublicKey();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const res = await api.subscribePush(sub.toJSON());
      setIsSubscribed(true);
      setSubscriptionCount(res.subscriptionCount);
      setStatusMessage('Device registered. Calls and messages will alert this device even when closed.');
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to register device for push alerts.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const disableNotifications = useCallback(async () => {
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) {
        await sub.unsubscribe();
      }
      const res = await api.unsubscribePush(endpoint);
      setIsSubscribed(false);
      setSubscriptionCount(res.subscriptionCount);
      setStatusMessage('Device push notifications paused.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disable push alerts.');
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTestAlert = useCallback(async (kind: 'message' | 'call') => {
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const res = await api.testPush(kind);
      if (res.sent > 0) {
        setStatusMessage(
          kind === 'call'
            ? 'Test incoming call notification sent to your device.'
            : 'Test message notification sent to your device.'
        );
      } else {
        setError('No active push subscription found on this device. Enable notifications first.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send test alert.');
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    supported,
    permission,
    swReady,
    isSubscribed,
    subscriptionCount,
    busy,
    statusMessage,
    error,
    enableNotifications,
    disableNotifications,
    sendTestAlert,
    refreshState,
  };
}
