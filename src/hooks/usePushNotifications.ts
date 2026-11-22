import { useState } from 'react';

export function usePushNotifications(isAuthenticated: boolean) {
  void isAuthenticated;
  const supported = false;

  const [permission] = useState<NotificationPermission>('default');
  const [swReady] = useState(false);
  const [isSubscribed] = useState(false);
  const [subscriptionCount] = useState(0);
  const [busy] = useState(false);
  const [statusMessage] = useState<string | null>('Push notifications are paused while core app features are being set up.');
  const [error] = useState<string | null>(null);
  const enableNotifications = async () => false;
  const disableNotifications = async () => undefined;
  const sendTestAlert = async (_kind: 'message' | 'call') => undefined;
  const refreshState = async () => undefined;

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
