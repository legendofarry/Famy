export type MessageType = 'text' | 'image' | 'video' | 'link' | 'call';
export type CallMode = 'audio' | 'video';
export type CallOutcome = 'completed' | 'missed' | 'declined' | 'cancelled';

export interface UserPublic {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  online: boolean;
  lastSeen: number;
}

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  domain: string;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  type: MessageType;
  body: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  linkDomain: string | null;
  callType: CallMode | null;
  callStatus: CallOutcome | null;
  callDuration: number | null;
  createdAt: number;
  readAt: number | null;
}

export interface ConversationSummary {
  id: string;
  peer: UserPublic;
  isGroup?: boolean;
  memberIds?: string[];
  lastMessage: MessageItem | null;
  unreadCount: number;
  updatedAt: number;
}

export interface CallHistoryItem {
  id: string;
  conversationId: string;
  peer: UserPublic;
  direction: 'outgoing' | 'incoming';
  callType: CallMode;
  callStatus: CallOutcome;
  callDuration: number;
  createdAt: number;
}

export interface PushStatusInfo {
  vapidConfigured: boolean;
  subscriptionCount: number;
}

export type CallSessionPhase =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'connected'
  | 'ended';

export interface ActiveCallState {
  callId: string;
  conversationId: string;
  peer: UserPublic;
  mode: CallMode;
  phase: CallSessionPhase;
  startedAt: number | null;
  endReason?: string;
}
