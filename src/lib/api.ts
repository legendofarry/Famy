import type {
  CallHistoryItem,
  ConversationSummary,
  LinkPreview,
  MessageItem,
  PushStatusInfo,
  UserPublic,
} from '../shared/types';

const TOKEN_KEY = 'famy_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  signup(username: string, password: string) {
    return request<{ token: string; user: UserPublic }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  signin(username: string, password: string) {
    return request<{ token: string; user: UserPublic }>('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  signout() {
    return request<{ ok: boolean }>('/api/auth/signout', { method: 'POST' });
  },

  me() {
    return request<{ user: UserPublic }>('/api/auth/me');
  },

  searchUsers(q: string) {
    return request<{ users: UserPublic[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
  },

  listConversations() {
    return request<{ conversations: ConversationSummary[] }>('/api/conversations');
  },

  startConversation(username: string) {
    return request<{ conversation: ConversationSummary }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  },

  listMessages(conversationId: string) {
    return request<{ messages: MessageItem[] }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
  },

  sendMessage(
    conversationId: string,
    payload: {
      body?: string;
      mediaUrl?: string;
      mediaMime?: string;
      mediaName?: string;
    }
  ) {
    return request<{ message: MessageItem }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async uploadMedia(file: File) {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string; mime: string; name: string; kind: 'image' | 'video' }>('/api/upload', {
      method: 'POST',
      body: form,
    });
  },

  previewLink(url: string) {
    return request<{ preview: LinkPreview }>('/api/links/preview', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  listCalls() {
    return request<{ calls: CallHistoryItem[] }>('/api/calls');
  },

  getVapidPublicKey() {
    return request<{ publicKey: string }>('/api/push/vapid-public-key');
  },

  getPushStatus() {
    return request<PushStatusInfo>('/api/push/status');
  },

  subscribePush(subscription: PushSubscriptionJSON) {
    return request<{ ok: boolean; subscriptionCount: number }>('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription }),
    });
  },

  unsubscribePush(endpoint?: string) {
    return request<{ ok: boolean; subscriptionCount: number }>('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    });
  },

  testPush(kind: 'message' | 'call') {
    return request<{ ok: boolean; sent: number; failed: number }>('/api/push/test', {
      method: 'POST',
      body: JSON.stringify({ kind }),
    });
  },
};
