/* Famy Service Worker Push & Notification Handlers */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Famy',
      body: event.data.text(),
      kind: 'message',
    };
  }

  const isCall = payload.kind === 'call';
  const title = payload.title || (isCall ? 'Incoming Famy Call' : 'New message on Famy');

  const options = {
    body: payload.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || (isCall ? `famy-call-${payload.callId || 'incoming'}` : `famy-msg-${payload.conversationId || 'chat'}`),
    renotify: true,
    requireInteraction: isCall,
    vibrate: isCall ? [240, 120, 240, 120, 360] : [120, 60, 120],
    data: {
      url: payload.url || '/',
      kind: payload.kind || 'message',
      callId: payload.callId || null,
      callerUsername: payload.callerUsername || null,
      callMode: payload.callMode || 'audio',
      conversationId: payload.conversationId || null,
    },
    actions: isCall
      ? [
          { action: 'accept', title: 'Answer' },
          { action: 'decline', title: 'Decline' },
        ]
      : [{ action: 'open', title: 'Open chat' }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === 'decline' && data.callId) {
    event.waitUntil(
      fetch('/api/calls/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: data.callId }),
      }).catch(() => {})
    );
    return;
  }

  let targetUrl = data.url || '/';
  if (data.kind === 'call' && data.callId) {
    const params = new URLSearchParams();
    params.set('incomingCall', data.callId);
    if (data.callerUsername) params.set('caller', data.callerUsername);
    if (data.callMode) params.set('mode', data.callMode);
    if (event.action === 'accept') params.set('autoAccept', '1');
    targetUrl = `/?${params.toString()}`;
  } else if (data.conversationId) {
    targetUrl = `/?chat=${encodeURIComponent(data.conversationId)}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'famy:notification-click',
            action: event.action || 'open',
            data,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
