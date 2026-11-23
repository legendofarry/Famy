import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, LogOut, MessageSquare, WifiOff, X } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { CallOverlay } from './components/CallOverlay';
import { ChatView } from './components/ChatView';
import { MobileBottomNav } from './components/MobileBottomNav';
import type { WorkspaceTab } from './components/MobileBottomNav';
import { NotificationsSetupPanel } from './components/NotificationsSetupPanel';
import { ProfileScreen } from './components/ProfileScreen';
import { Sidebar } from './components/Sidebar';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useWebRTC } from './hooks/useWebRTC';
import { api, getStoredToken } from './lib/api';
import { observeFamyAuthState, signOutFamy } from './lib/firebaseAuth';
import type {
  CallHistoryItem,
  CallMode,
  ConversationSummary,
  MessageItem,
  UserPublic,
} from './shared/types';

export default function App() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, MessageItem[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingByConv, setTypingByConv] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chats');
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('famy_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const isOnline = useOnlineStatus();
  const push = usePushNotifications(Boolean(user));
  const wsRef = useRef<WebSocket | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('famy_theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [darkMode]);

  const sendWsSignal = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const webrtc = useWebRTC({ sendSignal: sendWsSignal });
  const handleCallSignalRef = useRef(webrtc.handleCallSignal);
  useEffect(() => {
    handleCallSignalRef.current = webrtc.handleCallSignal;
  }, [webrtc.handleCallSignal]);

  // Restore persistent Firebase sessions and react to later sign-in/sign-out changes.
  useEffect(() => {
    const unsubscribe = observeFamyAuthState((profile) => {
      setUser(profile);
      setAuthChecking(false);
    });
    return unsubscribe;
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [convRes, callRes] = await Promise.all([api.listConversations(), api.listCalls()]);
      setConversations(convRes.conversations);
      setCalls(callRes.calls);

      const params = new URLSearchParams(window.location.search);
      const chatParam = params.get('chat');
      if (chatParam && convRes.conversations.some((c) => c.id === chatParam)) {
        setActiveConversationId(chatParam);
      } else if (window.innerWidth >= 768 && convRes.conversations.length > 0 && !activeConversationIdRef.current) {
        setActiveConversationId(convRes.conversations[0].id);
      }
    } catch {
      // Handled on next reconnect
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadWorkspaceData();
    // Firestore is the source of truth; refresh while the app is open until
    // the realtime signaling layer is enabled.
    const timer = window.setInterval(() => { void loadWorkspaceData(); }, 5000);
    return () => window.clearInterval(timer);
  }, [user, loadWorkspaceData]);

  // Load messages whenever activeConversationId changes
  useEffect(() => {
    if (!user || !activeConversationId) return;
    let active = true;
    setLoadingMessages(true);

    api
      .listMessages(activeConversationId)
      .then((res) => {
        if (!active) return;
        setMessagesByConv((prev) => ({ ...prev, [activeConversationId]: res.messages }));
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversationId ? { ...c, unreadCount: 0 } : c))
        );
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingMessages(false);
      });

    const refreshTimer = window.setInterval(() => {
      api.listMessages(activeConversationId).then((res) => {
        if (active) setMessagesByConv((prev) => ({ ...prev, [activeConversationId]: res.messages }));
      }).catch(() => {});
    }, 2500);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [user, activeConversationId]);

  // Real-Time WebSocket connection
  useEffect(() => {
    if (!user) return;
    const token = getStoredToken();
    if (!token) return;

    let cancelled = false;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        void loadWorkspaceData();
      };

      ws.onmessage = (ev) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        const type = String(data.type || '');

        if (type === 'presence:update') {
          const targetId = String(data.userId);
          const online = Boolean(data.online);
          const lastSeen = Number(data.lastSeen || Date.now());
          setConversations((prev) =>
            prev.map((c) =>
              c.peer.id === targetId ? { ...c, peer: { ...c.peer, online, lastSeen } } : c
            )
          );
          return;
        }

        if (type === 'typing:start' || type === 'typing:stop') {
          const convId = String(data.conversationId || '');
          const username = String(data.username || '');
          setTypingByConv((prev) => {
            const next = { ...prev };
            if (type === 'typing:start') {
              next[convId] = username;
            } else {
              delete next[convId];
            }
            return next;
          });
          return;
        }

        if (type === 'conversation:read') {
          const convId = String(data.conversationId || '');
          const readAt = Number(data.readAt || Date.now());
          setMessagesByConv((prev) => {
            const list = prev[convId];
            if (!list) return prev;
            return {
              ...prev,
              [convId]: list.map((m) => (m.readAt ? m : { ...m, readAt })),
            };
          });
          return;
        }

        if (type === 'message:new') {
          const msg = data.message as MessageItem;
          if (!msg) return;

          setMessagesByConv((prev) => {
            const existing = prev[msg.conversationId] || [];
            if (existing.some((m) => m.id === msg.id)) return prev;
            return { ...prev, [msg.conversationId]: [...existing, msg] };
          });

          const isViewing = activeConversationIdRef.current === msg.conversationId;
          if (isViewing && msg.senderId !== user.id) {
            sendWsSignal({ type: 'conversation:read', conversationId: msg.conversationId });
          }

          setConversations((prev) => {
            const exists = prev.some((c) => c.id === msg.conversationId);
            if (!exists) {
              void loadWorkspaceData();
              return prev;
            }
            const updated = prev.map((c) => {
              if (c.id !== msg.conversationId) return c;
              const incrementUnread = msg.senderId !== user.id && !isViewing ? 1 : 0;
              return {
                ...c,
                lastMessage: msg,
                updatedAt: msg.createdAt,
                unreadCount: isViewing ? 0 : c.unreadCount + incrementUnread,
              };
            });
            return [...updated].sort((a, b) => b.updatedAt - a.updatedAt);
          });

          if (msg.type === 'call') {
            api
              .listCalls()
              .then((res) => setCalls(res.calls))
              .catch(() => {});
          }
          return;
        }

        if (type.startsWith('call:')) {
          void handleCallSignalRef.current(data);
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        const delay = Math.min(10000, 1000 * Math.pow(1.6, attempt));
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, loadWorkspaceData, sendWsSignal]);

  // Listen for Service Worker notification click messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'famy:notification-click') {
        const convId = event.data?.data?.conversationId;
        if (convId) {
          setActiveTab('chats');
          setActiveConversationId(String(convId));
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations]
  );

  const handleSendMessage = async (payload: {
    body?: string;
    mediaUrl?: string;
    mediaMime?: string;
    mediaName?: string;
  }) => {
    if (!activeConversationId) return;
    const res = await api.sendMessage(activeConversationId, payload);
    const msg = res.message;
    setMessagesByConv((prev) => {
      const existing = prev[activeConversationId] || [];
      if (existing.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [activeConversationId]: [...existing, msg] };
    });
    setConversations((prev) =>
      [...prev]
        .map((c) =>
          c.id === activeConversationId
            ? { ...c, lastMessage: msg, updatedAt: msg.createdAt }
            : c
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );
  };

  const handleTypingChange = (typing: boolean) => {
    if (!activeConversationId) return;
    sendWsSignal({
      type: typing ? 'typing:start' : 'typing:stop',
      conversationId: activeConversationId,
    });
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOutFamy();
      setSignOutConfirmOpen(false);
      setUser(null);
      setConversations([]);
      setMessagesByConv({});
      setActiveConversationId(null);
    } catch {
      setSignOutError('Could not sign out. Please check your connection and try again.');
    } finally {
      setSigningOut(false);
    }
  };

  if (authChecking) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#F6F7F5] dark:bg-[#0B110F]">
        <div className="text-center space-y-3">
          <img src="/icon.svg" alt="Famy" className="w-12 h-12 rounded-2xl mx-auto" />
          <p className="font-display text-sm text-[#5B6862] dark:text-[#9AA8A1]">
            Opening Famy...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={(loggedInUser) => setUser(loggedInUser)} />;
  }

  // The push feature is intentionally parked while auth and messaging move to Firebase.
  const notificationsReady = true;
  const showMobileChat = Boolean(activeConversation);

  return (
    <div className="h-full w-full flex flex-col bg-[#F6F7F5] dark:bg-[#0B110F] text-[#111815] dark:text-[#F1F5F3] overflow-hidden">
      {!isOnline && (
        <div
          role="status"
          className="px-4 py-2 bg-[#B45309] text-white text-xs font-medium flex items-center justify-center gap-2 shrink-0"
        >
          <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Offline — cached conversations remain viewable until connection returns.</span>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar (always shown on desktop, hidden on mobile when a chat is active) */}
        <div className={`${showMobileChat ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
          <Sidebar
            currentUser={user}
            conversations={conversations}
            calls={calls}
            activeConversationId={activeConversationId}
            typingByConv={typingByConv}
            activeTab={activeTab}
            darkMode={darkMode}
            push={push}
            onSelectTab={(tab) => setActiveTab(tab)}
            onSelectConversation={(id) => {
              setActiveConversationId(id);
              setActiveTab('chats');
            }}
            onConversationCreated={(conv) => {
              setConversations((prev) => {
                const exists = prev.some((c) => c.id === conv.id);
                return exists ? prev : [conv, ...prev];
              });
              setActiveConversationId(conv.id);
              setActiveTab('chats');
            }}
            onStartCall={(convId, peer, mode: CallMode) => {
              void webrtc.startCall(convId, peer, mode);
            }}
            onOpenNotificationsModal={() => setNotificationsModalOpen(true)}
            onOpenProfile={() => setProfileOpen(true)}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            onSignOut={() => {
              setSignOutError(null);
              setSignOutConfirmOpen(true);
            }}
          />
        </div>

        {/* Right Main Pane (Desktop) or Active Chat View (Mobile) */}
        <main className={`${showMobileChat ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 h-full`}>
          {activeConversation ? (
            <ChatView
              currentUser={user}
              conversation={activeConversation}
              messages={messagesByConv[activeConversation.id] || []}
              loading={loadingMessages}
              peerTyping={Boolean(typingByConv[activeConversation.id])}
              onBackMobile={() => setActiveConversationId(null)}
              onSendMessage={handleSendMessage}
              onTypingChange={handleTypingChange}
              onStartCall={(mode) =>
                void webrtc.startCall(activeConversation.id, activeConversation.peer, mode)
              }
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center chat-wallpaper">
              <div className="max-w-md w-full bg-white dark:bg-[#141D1A] rounded-2xl border border-[#E2E6E1] dark:border-[#24322D] p-7 space-y-5 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-[#0F766E]/12 text-[#0F766E] dark:text-[#5EEAD4] flex items-center justify-center mx-auto">
                  {notificationsReady ? (
                    <MessageSquare className="w-6 h-6" />
                  ) : (
                    <BellRing className="w-6 h-6" />
                  )}
                </div>

                <div className="space-y-1.5">
                  <h2 className="font-display text-xl font-semibold">
                    {notificationsReady
                      ? `Signed in as @${user.username}`
                      : 'Set up device call alerts'}
                  </h2>
                  <p className="text-sm text-[#5B6862] dark:text-[#9AA8A1]">
                    {notificationsReady
                      ? 'Select a conversation on the left to send messages, share media, or place voice and video calls.'
                      : 'Allow push notifications so incoming Famy calls ring on your device even when the app is closed.'}
                  </p>
                </div>

                {!notificationsReady && (
                  <button
                    type="button"
                    onClick={() => setNotificationsModalOpen(true)}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0D655E] text-white text-sm font-medium cursor-pointer"
                  >
                    Configure Device Notifications
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (hidden inside active chat thread so keyboard/composer stays clear) */}
      {!showMobileChat && (
        <MobileBottomNav
          activeTab={activeTab}
          unreadTotal={totalUnread}
          notificationsReady={notificationsReady}
          onSelectTab={(tab) => setActiveTab(tab)}
        />
      )}

      {/* Notifications Setup Modal */}
      {notificationsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Device notification setup"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <NotificationsSetupPanel
            push={push}
            username={user.username}
            onClose={() => setNotificationsModalOpen(false)}
          />
        </div>
      )}

      {profileOpen && (
        <ProfileScreen
          user={user}
          onClose={() => setProfileOpen(false)}
          onUpdated={(updated) => { setUser(updated); setProfileOpen(false); }}
        />
      )}

      {signOutConfirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!signingOut) setSignOutConfirmOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !signingOut) setSignOutConfirmOpen(false);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sign-out-title"
            aria-describedby="sign-out-description"
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl dark:border-[#2B3A34] dark:bg-[#141D1A]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-6 sm:p-7">
              <div className="mb-5 flex items-start justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/60">
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  aria-label="Cancel sign out"
                  disabled={signingOut}
                  onClick={() => setSignOutConfirmOpen(false)}
                  className="grid h-9 w-9 place-items-center rounded-full text-[#6B7872] transition hover:bg-[#F2F4F2] disabled:opacity-50 dark:hover:bg-[#1E2B27]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <h2 id="sign-out-title" className="font-display text-xl font-semibold tracking-tight">
                Sign out of Famy?
              </h2>
              <p id="sign-out-description" className="mt-2 text-sm leading-relaxed text-[#5B6862] dark:text-[#A9B5AF]">
                You’ll need to sign in again to see your conversations and messages.
              </p>
              {signOutError && (
                <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  {signOutError}
                </p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[#E8ECE8] bg-[#FAFBFA] p-4 sm:flex-row sm:justify-end dark:border-[#26332E] dark:bg-[#111916]">
              <button
                type="button"
                autoFocus
                disabled={signingOut}
                onClick={() => setSignOutConfirmOpen(false)}
                className="min-h-11 rounded-xl border border-[#DCE3DF] px-4 text-sm font-medium text-[#33413C] transition hover:bg-white disabled:opacity-50 dark:border-[#34443D] dark:text-[#D3DDD7] dark:hover:bg-[#1B2621]"
              >
                Stay signed in
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Live WebRTC Call Overlay */}
      {webrtc.callState && (
        <CallOverlay
          call={webrtc.callState}
          localStream={webrtc.localStream}
          remoteStream={webrtc.remoteStream}
          micMuted={webrtc.micMuted}
          cameraOff={webrtc.cameraOff}
          mediaNotice={webrtc.mediaNotice}
          elapsedSeconds={webrtc.elapsedSeconds}
          onAccept={() => void webrtc.acceptIncomingCall()}
          onReject={webrtc.rejectIncomingCall}
          onEnd={webrtc.endCall}
          onToggleMic={webrtc.toggleMic}
          onToggleCamera={webrtc.toggleCamera}
        />
      )}
    </div>
  );
}
