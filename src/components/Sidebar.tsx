import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  LogOut,
  MessageSquarePlus,
  Moon,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Search,
  Sun,
  Video,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { CallHistoryItem, CallMode, ConversationSummary, UserPublic } from '../shared/types';
import { formatCallDuration, formatMessageTime } from '../shared/validation';
import { Avatar } from './Avatar';
import type { WorkspaceTab } from './MobileBottomNav';
import type { PushControls } from './NotificationsSetupPanel';
import { NotificationsSetupPanel } from './NotificationsSetupPanel';

interface SidebarProps {
  currentUser: UserPublic;
  conversations: ConversationSummary[];
  calls: CallHistoryItem[];
  activeConversationId: string | null;
  typingByConv: Record<string, string>;
  activeTab: WorkspaceTab;
  darkMode: boolean;
  push: PushControls;
  onSelectTab: (tab: WorkspaceTab) => void;
  onSelectConversation: (conversationId: string) => void;
  onConversationCreated: (conv: ConversationSummary) => void;
  onStartCall: (convId: string, peer: UserPublic, mode: CallMode) => void;
  onOpenNotificationsModal: () => void;
  onToggleDarkMode: () => void;
  onSignOut: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  conversations,
  calls,
  activeConversationId,
  typingByConv,
  activeTab,
  darkMode,
  push,
  onSelectTab,
  onSelectConversation,
  onConversationCreated,
  onStartCall,
  onOpenNotificationsModal,
  onToggleDarkMode,
  onSignOut,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread'>('all');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [foundUsers, setFoundUsers] = useState<UserPublic[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);

  const notificationsReady = push.permission === 'granted' && push.isSubscribed;

  useEffect(() => {
    if (!newChatOpen) return;
    let active = true;
    setSearchingUsers(true);
    const timer = window.setTimeout(() => {
      api
        .searchUsers(userSearch)
        .then((res) => {
          if (active) setFoundUsers(res.users);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setSearchingUsers(false);
        });
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [newChatOpen, userSearch]);

  const handleStartChatWith = async (targetUsername: string) => {
    setNewChatError(null);
    try {
      const res = await api.startConversation(targetUsername);
      if (res.conversation) {
        onConversationCreated(res.conversation);
        setNewChatOpen(false);
        setUserSearch('');
      }
    } catch (err: unknown) {
      setNewChatError(err instanceof Error ? err.message : 'Unable to start chat.');
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (chatFilter === 'unread' && c.unreadCount === 0) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase().replace(/^@+/, '');
    return (
      c.peer.username.toLowerCase().includes(q) ||
      (c.lastMessage?.body || '').toLowerCase().includes(q)
    );
  });

  const renderMessagePreview = (conv: ConversationSummary): string => {
    if (typingByConv[conv.id]) {
      return 'Typing...';
    }
    const msg = conv.lastMessage;
    if (!msg) return 'Start a conversation';
    if (msg.type === 'image') return msg.body ? `Photo · ${msg.body}` : 'Sent a photo';
    if (msg.type === 'video') return msg.body ? `Video · ${msg.body}` : 'Sent a video';
    if (msg.type === 'call') {
      const label = msg.callType === 'video' ? 'Video call' : 'Voice call';
      if (msg.callStatus === 'completed' && msg.callDuration) {
        return `${label} · ${formatCallDuration(msg.callDuration)}`;
      }
      return `${label} · ${msg.callStatus || 'ended'}`;
    }
    if (msg.type === 'link' && !msg.body) {
      return msg.linkTitle || msg.linkDomain || 'Shared link';
    }
    return msg.body;
  };

  return (
    <aside className="w-full md:w-[340px] lg:w-[380px] shrink-0 h-full flex flex-col bg-white dark:bg-[#111917] border-r border-[#E2E6E1] dark:border-[#24322D]">
      {/* Top User & Brand Bar */}
      <header className="px-4 h-16 shrink-0 flex items-center justify-between gap-2 border-b border-[#EAECE9] dark:border-[#1E2A26]">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar username={currentUser.username} avatarUrl={currentUser.avatarUrl} online size="sm" />
          <div className="min-w-0">
            <span className="font-display text-lg font-semibold tracking-tight block leading-tight">
              Famy
            </span>
            <span className="text-xs text-[#5B6862] dark:text-[#9AA8A1] truncate block">
              @{currentUser.username}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setNewChatOpen(true);
              setNewChatError(null);
            }}
            aria-label="New conversation"
            title="New conversation"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#33413C] dark:text-[#CBD5D0] hover:bg-[#F2F4F2] dark:hover:bg-[#1C2723] transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </button>

          {push.supported && <button
            type="button"
            onClick={onOpenNotificationsModal}
            aria-label={notificationsReady ? 'Notification settings' : 'Set up notifications'}
            title="Device notifications"
            className={`relative min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              notificationsReady
                ? 'text-[#0F766E] dark:text-[#5EEAD4] hover:bg-[#F2F4F2] dark:hover:bg-[#1C2723]'
                : 'text-[#B45309] dark:text-[#FCD34D] hover:bg-[#FEF3C7]/60 dark:hover:bg-[#2E2412]'
            }`}
          >
            {notificationsReady ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          </button>}

          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#33413C] dark:text-[#CBD5D0] hover:bg-[#F2F4F2] dark:hover:bg-[#1C2723] transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#5B6862] hover:text-[#B91C1C] hover:bg-[#FEF2F2] dark:hover:bg-[#3B1518] transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Notifications First Setup Banner */}
      {!notificationsReady && activeTab !== 'alerts' && (
        <div className="mx-3 mt-3 p-3.5 rounded-xl bg-[#F0FBF8] dark:bg-[#0E2823] border border-[#BDE7DC] dark:border-[#194B41] flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-semibold text-[#0F5A52] dark:text-[#6EE7B7]">
              Receive calls while closed
            </p>
            <p className="text-xs text-[#3D6A62] dark:text-[#9ED9CE]">
              Enable device notifications to answer calls anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenNotificationsModal}
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            Set Up
          </button>
        </div>
      )}

      {/* Desktop Mode Tabs */}
      <div
        role="tablist"
        aria-label="Workspace sections"
        className="hidden md:grid grid-cols-3 gap-1 mx-3 mt-3 p-1 bg-[#F0F2EF] dark:bg-[#18231F] rounded-xl shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'chats'}
          onClick={() => onSelectTab('chats')}
          className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'chats'
              ? 'bg-white dark:bg-[#23312B] text-[#111815] dark:text-white shadow-xs'
              : 'text-[#5B6862] dark:text-[#9AA8A1] hover:text-[#111815] dark:hover:text-white'
          }`}
        >
          Chats
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'calls'}
          onClick={() => onSelectTab('calls')}
          className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'calls'
              ? 'bg-white dark:bg-[#23312B] text-[#111815] dark:text-white shadow-xs'
              : 'text-[#5B6862] dark:text-[#9AA8A1] hover:text-[#111815] dark:hover:text-white'
          }`}
        >
          Calls
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'alerts'}
          onClick={() => onSelectTab('alerts')}
          className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'alerts'
              ? 'bg-white dark:bg-[#23312B] text-[#111815] dark:text-white shadow-xs'
              : 'text-[#5B6862] dark:text-[#9AA8A1] hover:text-[#111815] dark:hover:text-white'
          }`}
        >
          Alerts
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'chats' && (
        <>
          <div className="px-3 pt-3 pb-2 space-y-2.5 shrink-0">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7872]"
              />
              <input
                type="search"
                aria-label="Search conversations"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats or @username"
                className="w-full min-h-[42px] pl-10 pr-3 py-2 rounded-xl bg-[#F3F5F2] dark:bg-[#17211D] text-sm placeholder:text-[#6B7872] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setChatFilter('all')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  chatFilter === 'all'
                    ? 'bg-[#0F766E]/12 text-[#0F766E] dark:bg-[#14B8A6]/20 dark:text-[#5EEAD4]'
                    : 'text-[#5B6862] dark:text-[#9AA8A1] hover:bg-[#F3F5F2] dark:hover:bg-[#17211D]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setChatFilter('unread')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  chatFilter === 'unread'
                    ? 'bg-[#0F766E]/12 text-[#0F766E] dark:bg-[#14B8A6]/20 dark:text-[#5EEAD4]'
                    : 'text-[#5B6862] dark:text-[#9AA8A1] hover:bg-[#F3F5F2] dark:hover:bg-[#17211D]'
                }`}
              >
                Unread
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pb-20 md:pb-3 divide-y divide-[#F0F2EF] dark:divide-[#1B2622]">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm font-medium text-[#33413C] dark:text-[#CBD5D0]">
                  {chatFilter === 'unread' ? 'No unread conversations' : 'No conversations found'}
                </p>
                <p className="text-xs text-[#6B7872] dark:text-[#8E9C95]">
                  Search for any Famy username to start a chat or call.
                </p>
                <button
                  type="button"
                  onClick={() => setNewChatOpen(true)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0F766E] text-white text-xs font-medium cursor-pointer"
                >
                  Start New Chat
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === activeConversationId;
                const ts = conv.lastMessage?.createdAt || conv.updatedAt;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    className={`w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#ECF6F3] dark:bg-[#182924]'
                        : 'hover:bg-[#F7F8F6] dark:hover:bg-[#16201D]'
                    }`}
                  >
                    <Avatar
                      username={conv.peer.username}
                      avatarUrl={conv.peer.avatarUrl}
                      online={conv.peer.online}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-display font-medium text-[15px] truncate">
                          @{conv.peer.username}
                        </span>
                        <span className="text-xs text-[#6B7872] dark:text-[#8E9C95] tabular-nums whitespace-nowrap shrink-0">
                          {formatMessageTime(ts)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span
                          className={`text-xs truncate ${
                            typingByConv[conv.id]
                              ? 'text-[#0F766E] dark:text-[#5EEAD4] font-medium'
                              : 'text-[#5B6862] dark:text-[#9AA8A1]'
                          }`}
                        >
                          {renderMessagePreview(conv)}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#0F766E] text-white text-[11px] font-semibold flex items-center justify-center tabular-nums shrink-0">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}

      {activeTab === 'calls' && (
        <div className="flex-1 overflow-y-auto pb-20 md:pb-3 divide-y divide-[#F0F2EF] dark:divide-[#1B2622]">
          {calls.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-medium text-[#33413C] dark:text-[#CBD5D0]">No calls yet</p>
              <p className="text-xs text-[#6B7872] dark:text-[#8E9C95]">
                Open any chat and tap Voice or Video to place your first call.
              </p>
            </div>
          ) : (
            calls.map((call) => {
              const isMissedOrDeclined =
                call.callStatus === 'missed' || call.callStatus === 'declined';
              return (
                <div
                  key={call.id}
                  className="px-4 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      username={call.peer.username}
                      avatarUrl={call.peer.avatarUrl}
                      online={call.peer.online}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="font-display font-medium text-[15px] truncate">
                        @{call.peer.username}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-[#5B6862] dark:text-[#9AA8A1] tabular-nums">
                        {isMissedOrDeclined ? (
                          <PhoneMissed className="w-3.5 h-3.5 text-[#DC2626]" aria-hidden="true" />
                        ) : call.direction === 'outgoing' ? (
                          <PhoneOutgoing className="w-3.5 h-3.5 text-[#0F766E]" aria-hidden="true" />
                        ) : (
                          <PhoneIncoming className="w-3.5 h-3.5 text-[#0F766E]" aria-hidden="true" />
                        )}
                        <span>
                          {call.callType === 'video' ? 'Video' : 'Voice'} ·{' '}
                          {call.callStatus === 'completed'
                            ? formatCallDuration(call.callDuration)
                            : call.callStatus}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatMessageTime(call.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onStartCall(call.conversationId, call.peer, 'audio')}
                      aria-label={`Voice call @${call.peer.username}`}
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#0F766E] dark:text-[#5EEAD4] hover:bg-[#ECF6F3] dark:hover:bg-[#182924] transition-colors cursor-pointer"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCall(call.conversationId, call.peer, 'video')}
                      aria-label={`Video call @${call.peer.username}`}
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#0F766E] dark:text-[#5EEAD4] hover:bg-[#ECF6F3] dark:hover:bg-[#182924] transition-colors cursor-pointer"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="flex-1 overflow-y-auto pb-20 md:pb-4">
          <NotificationsSetupPanel push={push} username={currentUser.username} embedded />
        </div>
      )}

      {/* New Chat Modal */}
      {newChatOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Start new conversation"
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#141D1A] rounded-2xl border border-[#E2E6E1] dark:border-[#24322D] p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">Start a chat</h3>
              <button
                type="button"
                onClick={() => setNewChatOpen(false)}
                aria-label="Close new chat dialog"
                className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#5B6862] hover:bg-[#F2F4F2] dark:hover:bg-[#1E2B27] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (userSearch.trim()) {
                  void handleStartChatWith(userSearch);
                }
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <span
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7872] text-sm"
                >
                  @
                </span>
                <input
                  type="text"
                  autoFocus
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Enter username"
                  aria-label="Find user by username"
                  className="w-full min-h-[44px] pl-8 pr-3 py-2 rounded-xl bg-[#F3F5F2] dark:bg-[#17211D] text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0F766E] text-white text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                Chat
              </button>
            </form>

            {newChatError && (
              <p role="alert" className="text-xs text-[#DC2626] dark:text-[#FCA5A5]">
                {newChatError}
              </p>
            )}

            <div className="max-h-64 overflow-y-auto divide-y divide-[#F0F2EF] dark:divide-[#1E2B27]">
              {searchingUsers ? (
                <p className="py-4 text-center text-xs text-[#6B7872]">Searching users...</p>
              ) : foundUsers.length === 0 ? (
                <p className="py-4 text-center text-xs text-[#6B7872]">
                  No matching Famy usernames found.
                </p>
              ) : (
                foundUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => void handleStartChatWith(u.username)}
                    className="w-full py-2.5 px-2 flex items-center gap-3 hover:bg-[#F7F8F6] dark:hover:bg-[#192420] rounded-xl text-left transition-colors cursor-pointer"
                  >
                    <Avatar username={u.username} avatarUrl={u.avatarUrl} online={u.online} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-medium text-sm truncate">@{u.username}</p>
                      <p className="text-xs text-[#6B7872] dark:text-[#8E9C95] truncate">
                        {u.bio || 'On Famy'}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
