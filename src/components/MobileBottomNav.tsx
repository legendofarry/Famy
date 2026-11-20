import React from 'react';
import { Bell, MessageSquare, Phone } from 'lucide-react';

export type WorkspaceTab = 'chats' | 'calls' | 'alerts';

interface MobileBottomNavProps {
  activeTab: WorkspaceTab;
  unreadTotal: number;
  notificationsReady: boolean;
  onSelectTab: (tab: WorkspaceTab) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  unreadTotal,
  notificationsReady,
  onSelectTab,
}) => {
  return (
    <nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#111917]/95 backdrop-blur-md border-t border-[#E2E6E1] dark:border-[#24322D] grid grid-cols-3 h-16 px-2"
    >
      <button
        type="button"
        onClick={() => onSelectTab('chats')}
        className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors cursor-pointer ${
          activeTab === 'chats'
            ? 'text-[#0F766E] dark:text-[#5EEAD4]'
            : 'text-[#5B6862] dark:text-[#9AA8A1]'
        }`}
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5" aria-hidden="true" />
          {unreadTotal > 0 && (
            <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#0F766E] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </div>
        <span className="text-[11px] font-medium">Chats</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab('calls')}
        className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors cursor-pointer ${
          activeTab === 'calls'
            ? 'text-[#0F766E] dark:text-[#5EEAD4]'
            : 'text-[#5B6862] dark:text-[#9AA8A1]'
        }`}
      >
        <Phone className="w-5 h-5" aria-hidden="true" />
        <span className="text-[11px] font-medium">Calls</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab('alerts')}
        className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors cursor-pointer ${
          activeTab === 'alerts'
            ? 'text-[#0F766E] dark:text-[#5EEAD4]'
            : 'text-[#5B6862] dark:text-[#9AA8A1]'
        }`}
      >
        <div className="relative">
          <Bell className="w-5 h-5" aria-hidden="true" />
          {!notificationsReady && (
            <span
              aria-label="Setup needed"
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#D97706]"
            />
          )}
        </div>
        <span className="text-[11px] font-medium">Alerts</span>
      </button>
    </nav>
  );
};
