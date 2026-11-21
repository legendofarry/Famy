import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { generateVAPIDKeys } from 'web-push';
import type {
  CallHistoryItem,
  CallMode,
  CallOutcome,
  ConversationSummary,
  LinkPreview,
  MessageItem,
  MessageType,
  UserPublic,
} from '../src/shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'famy.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    unread_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    type TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    media_url TEXT,
    media_mime TEXT,
    media_name TEXT,
    link_url TEXT,
    link_title TEXT,
    link_description TEXT,
    link_domain TEXT,
    call_type TEXT,
    call_status TEXT,
    call_duration INTEGER,
    created_at INTEGER NOT NULL,
    read_at INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
if (!userColumns.some((column) => column.name === 'firebase_uid')) {
  db.exec('ALTER TABLE users ADD COLUMN firebase_uid TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)');
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
}

export function getOrCreateVapidKeys(): VapidConfig {
  const pubRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('vapid_public_key') as
    | { value: string }
    | undefined;
  const privRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('vapid_private_key') as
    | { value: string }
    | undefined;

  if (pubRow?.value && privRow?.value) {
    return { publicKey: pubRow.value, privateKey: privRow.value };
  }

  const keys = generateVAPIDKeys();
  db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run(
    'vapid_public_key',
    keys.publicKey
  );
  db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run(
    'vapid_private_key',
    keys.privateKey
  );
  return keys;
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { hash: derived, salt: usedSalt };
}

export function createUser(username: string, password: string, avatarUrl: string | null = null, bio: string | null = null): UserRow {
  const now = Date.now();
  const id = `usr_${crypto.randomUUID()}`;
  const { hash, salt } = hashPassword(password);
  db.prepare(
    'INSERT INTO users (id, username, password_hash, password_salt, avatar_url, bio, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, username, hash, salt, avatarUrl, bio, now, now);
  return {
    id,
    username,
    password_hash: hash,
    password_salt: salt,
    avatar_url: avatarUrl,
    bio,
    created_at: now,
    last_seen: now,
  };
}

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: number;
  last_seen: number;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function findUserByFirebaseUid(firebaseUid: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid) as UserRow | undefined;
}

export function createFirebaseUser(
  firebaseUid: string,
  username: string,
  avatarUrl: string | null = null,
  bio: string | null = null
): UserRow {
  const now = Date.now();
  let normalizedUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24);
  if (normalizedUsername.length < 3) normalizedUsername = `user_${crypto.randomUUID().slice(0, 8)}`;

  let candidate = normalizedUsername;
  let suffix = 1;
  while (findUserByUsername(candidate)) {
    const suffixText = `_${suffix}`;
    candidate = `${normalizedUsername.slice(0, 24 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  const dummy = hashPassword(crypto.randomUUID());
  db.prepare(
    'INSERT INTO users (id, username, password_hash, password_salt, avatar_url, bio, created_at, last_seen, firebase_uid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    `usr_${crypto.randomUUID()}`,
    candidate,
    dummy.hash,
    dummy.salt,
    avatarUrl,
    bio,
    now,
    now,
    firebaseUid
  );
  return findUserByFirebaseUid(firebaseUid)!;
}

export function findUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function toPublicUser(row: UserRow, onlineSet: Set<string>): UserPublic {
  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    online: onlineSet.has(row.id),
    lastSeen: row.last_seen,
  };
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 1000 * 60 * 60 * 24 * 30;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now,
    expiresAt
  );
  return token;
}

export function getUserBySessionToken(token: string): UserRow | undefined {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now) as UserRow | undefined;
  return row;
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function updateLastSeen(userId: string): void {
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);
}

export function getOrCreateDirectConversation(userAId: string, userBId: string): string {
  const existing = db
    .prepare(
      `SELECT cm1.conversation_id AS id
       FROM conversation_members cm1
       JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
       WHERE cm1.user_id = ? AND cm2.user_id = ?`
    )
    .get(userAId, userBId) as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  const convId = `conv_${crypto.randomUUID()}`;
  const now = Date.now();
  db.prepare('INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)').run(
    convId,
    now,
    now
  );
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id, unread_count) VALUES (?, ?, 0)').run(
    convId,
    userAId
  );
  if (userAId !== userBId) {
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, unread_count) VALUES (?, ?, 0)').run(
      convId,
      userBId
    );
  }
  return convId;
}

export function insertMessage(input: {
  conversationId: string;
  senderId: string;
  type: MessageType;
  body?: string;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
  link?: LinkPreview | null;
  callType?: CallMode | null;
  callStatus?: CallOutcome | null;
  callDuration?: number | null;
  createdAt?: number;
}): MessageItem {
  const id = `msg_${crypto.randomUUID()}`;
  const now = input.createdAt ?? Date.now();
  const body = input.body ?? '';

  db.prepare(
    `INSERT INTO messages (
      id, conversation_id, sender_id, type, body,
      media_url, media_mime, media_name,
      link_url, link_title, link_description, link_domain,
      call_type, call_status, call_duration,
      created_at, read_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    id,
    input.conversationId,
    input.senderId,
    input.type,
    body,
    input.mediaUrl ?? null,
    input.mediaMime ?? null,
    input.mediaName ?? null,
    input.link?.url ?? null,
    input.link?.title ?? null,
    input.link?.description ?? null,
    input.link?.domain ?? null,
    input.callType ?? null,
    input.callStatus ?? null,
    input.callDuration ?? null,
    now
  );

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, input.conversationId);
  db.prepare(
    'UPDATE conversation_members SET unread_count = unread_count + 1 WHERE conversation_id = ? AND user_id != ?'
  ).run(input.conversationId, input.senderId);

  const sender = findUserById(input.senderId);
  return {
    id,
    conversationId: input.conversationId,
    senderId: input.senderId,
    senderUsername: sender?.username ?? 'unknown',
    type: input.type,
    body,
    mediaUrl: input.mediaUrl ?? null,
    mediaMime: input.mediaMime ?? null,
    mediaName: input.mediaName ?? null,
    linkUrl: input.link?.url ?? null,
    linkTitle: input.link?.title ?? null,
    linkDescription: input.link?.description ?? null,
    linkDomain: input.link?.domain ?? null,
    callType: input.callType ?? null,
    callStatus: input.callStatus ?? null,
    callDuration: input.callDuration ?? null,
    createdAt: now,
    readAt: null,
  };
}

export function mapMessageRow(row: Record<string, unknown>): MessageItem {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    senderUsername: String(row.sender_username ?? ''),
    type: row.type as MessageType,
    body: String(row.body ?? ''),
    mediaUrl: row.media_url ? String(row.media_url) : null,
    mediaMime: row.media_mime ? String(row.media_mime) : null,
    mediaName: row.media_name ? String(row.media_name) : null,
    linkUrl: row.link_url ? String(row.link_url) : null,
    linkTitle: row.link_title ? String(row.link_title) : null,
    linkDescription: row.link_description ? String(row.link_description) : null,
    linkDomain: row.link_domain ? String(row.link_domain) : null,
    callType: row.call_type ? (row.call_type as CallMode) : null,
    callStatus: row.call_status ? (row.call_status as CallOutcome) : null,
    callDuration: typeof row.call_duration === 'number' ? row.call_duration : null,
    createdAt: Number(row.created_at),
    readAt: typeof row.read_at === 'number' ? row.read_at : null,
  };
}

export function getConversationMemberIds(conversationId: string): string[] {
  const rows = db
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?')
    .all(conversationId) as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

export function isConversationMember(conversationId: string, userId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId);
  return Boolean(row);
}

export function markConversationRead(conversationId: string, userId: string): void {
  const now = Date.now();
  db.prepare('UPDATE conversation_members SET unread_count = 0 WHERE conversation_id = ? AND user_id = ?').run(
    conversationId,
    userId
  );
  db.prepare(
    'UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL'
  ).run(now, conversationId, userId);
}

export function getConversationMessages(conversationId: string): MessageItem[] {
  const rows = db
    .prepare(
      `SELECT m.*, u.username AS sender_username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(conversationId) as Array<Record<string, unknown>>;

  return rows.map(mapMessageRow);
}

export function listUserConversations(userId: string, onlineSet: Set<string>): ConversationSummary[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.updated_at, cm_self.unread_count,
              peer.id AS peer_id, peer.username AS peer_username,
              peer.avatar_url AS peer_avatar_url, peer.bio AS peer_bio,
              peer.created_at AS peer_created_at, peer.last_seen AS peer_last_seen,
              peer.password_hash AS peer_password_hash, peer.password_salt AS peer_password_salt
       FROM conversations c
       JOIN conversation_members cm_self ON cm_self.conversation_id = c.id AND cm_self.user_id = ?
       JOIN conversation_members cm_peer ON cm_peer.conversation_id = c.id AND cm_peer.user_id != ?
       JOIN users peer ON peer.id = cm_peer.user_id
       ORDER BY c.updated_at DESC`
    )
    .all(userId, userId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const convId = String(row.id);
    const lastRow = db
      .prepare(
        `SELECT m.*, u.username AS sender_username
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ?
         ORDER BY m.created_at DESC
         LIMIT 1`
      )
      .get(convId) as Record<string, unknown> | undefined;

    const peerUser: UserRow = {
      id: String(row.peer_id),
      username: String(row.peer_username),
      avatar_url: row.peer_avatar_url ? String(row.peer_avatar_url) : null,
      bio: row.peer_bio ? String(row.peer_bio) : null,
      created_at: Number(row.peer_created_at),
      last_seen: Number(row.peer_last_seen),
      password_hash: String(row.peer_password_hash),
      password_salt: String(row.peer_password_salt),
    };

    return {
      id: convId,
      peer: toPublicUser(peerUser, onlineSet),
      lastMessage: lastRow ? mapMessageRow(lastRow) : null,
      unreadCount: Number(row.unread_count ?? 0),
      updatedAt: Number(row.updated_at),
    };
  });
}

export function listUserCallHistory(userId: string, onlineSet: Set<string>): CallHistoryItem[] {
  const rows = db
    .prepare(
      `SELECT m.*, u.username AS sender_username,
              peer.id AS peer_id, peer.username AS peer_username,
              peer.avatar_url AS peer_avatar_url, peer.bio AS peer_bio,
              peer.created_at AS peer_created_at, peer.last_seen AS peer_last_seen,
              peer.password_hash AS peer_password_hash, peer.password_salt AS peer_password_salt
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       JOIN conversation_members cm_self ON cm_self.conversation_id = m.conversation_id AND cm_self.user_id = ?
       JOIN conversation_members cm_peer ON cm_peer.conversation_id = m.conversation_id AND cm_peer.user_id != ?
       JOIN users peer ON peer.id = cm_peer.user_id
       WHERE m.type = 'call'
       ORDER BY m.created_at DESC
       LIMIT 50`
    )
    .all(userId, userId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const peerUser: UserRow = {
      id: String(row.peer_id),
      username: String(row.peer_username),
      avatar_url: row.peer_avatar_url ? String(row.peer_avatar_url) : null,
      bio: row.peer_bio ? String(row.peer_bio) : null,
      created_at: Number(row.peer_created_at),
      last_seen: Number(row.peer_last_seen),
      password_hash: String(row.peer_password_hash),
      password_salt: String(row.peer_password_salt),
    };

    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      peer: toPublicUser(peerUser, onlineSet),
      direction: String(row.sender_id) === userId ? 'outgoing' : 'incoming',
      callType: (row.call_type as CallMode) || 'audio',
      callStatus: (row.call_status as CallOutcome) || 'completed',
      callDuration: typeof row.call_duration === 'number' ? row.call_duration : 0,
      createdAt: Number(row.created_at),
    };
  });
}

export function searchUsers(query: string, excludeUserId: string, onlineSet: Set<string>): UserPublic[] {
  const clean = query.trim().toLowerCase().replace(/^@+/, '');
  const rows = clean
    ? (db
        .prepare('SELECT * FROM users WHERE id != ? AND username LIKE ? ORDER BY username ASC LIMIT 20')
        .all(excludeUserId, `%${clean}%`) as unknown as UserRow[])
    : (db
        .prepare('SELECT * FROM users WHERE id != ? ORDER BY last_seen DESC LIMIT 20')
        .all(excludeUserId) as unknown as UserRow[]);
  return rows.map((r) => toPublicUser(r, onlineSet));
}

export interface StoredPushSub {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function savePushSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null
): void {
  const id = `sub_${crypto.randomUUID()}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent`
  ).run(id, userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent, now);
}

export function deletePushSubscription(userId: string, endpoint?: string): void {
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
  } else {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(userId);
  }
}

export function deletePushSubscriptionByEndpoint(endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export function getUserPushSubscriptions(userId: string): StoredPushSub[] {
  return db
    .prepare('SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
    .all(userId) as unknown as StoredPushSub[];
}

export function ensureStarterContactsAndChats(): void {
  const starters = [
    {
      username: 'maya',
      avatar: '/src/assets/images/avatar_maya_1795170629337.jpg',
      bio: 'Product Designer · Available for calls',
    },
    {
      username: 'liam',
      avatar: '/src/assets/images/avatar_liam_1795170628413.jpg',
      bio: 'Studio Architect',
    },
    {
      username: 'sofia',
      avatar: '/src/assets/images/avatar_sofia_1795170629066.jpg',
      bio: 'Engineering Lead',
    },
  ];

  for (const s of starters) {
    const existing = findUserByUsername(s.username);
    if (!existing) {
      createUser(s.username, 'famy1234', s.avatar, s.bio);
    }
  }
}

export function seedWelcomeConversationsForNewUser(userId: string): void {
  const maya = findUserByUsername('maya');
  const liam = findUserByUsername('liam');
  const now = Date.now();

  if (maya && maya.id !== userId) {
    const convId = getOrCreateDirectConversation(userId, maya.id);
    const existingMsgs = getConversationMessages(convId);
    if (existingMsgs.length === 0) {
      insertMessage({
        conversationId: convId,
        senderId: maya.id,
        type: 'text',
        body: 'Welcome to Famy! Enable device notifications so voice and video calls ring even when the app is closed.',
        createdAt: now - 1000 * 60 * 18,
      });
      insertMessage({
        conversationId: convId,
        senderId: maya.id,
        type: 'image',
        body: 'Morning light at the studio cafe',
        mediaUrl: '/src/assets/images/shared_cafe_photo_1795170629016.jpg',
        mediaMime: 'image/jpeg',
        mediaName: 'studio-cafe.jpg',
        createdAt: now - 1000 * 60 * 16,
      });
    }
  }

  if (liam && liam.id !== userId) {
    const convId = getOrCreateDirectConversation(userId, liam.id);
    const existingMsgs = getConversationMessages(convId);
    if (existingMsgs.length === 0) {
      insertMessage({
        conversationId: convId,
        senderId: liam.id,
        type: 'link',
        body: 'Shared the architecture notes for tomorrow: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API',
        link: {
          url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API',
          title: 'WebRTC API — MDN Web Docs',
          description: 'Real-time peer-to-peer audio, video, and data communication on the web.',
          domain: 'developer.mozilla.org',
        },
        createdAt: now - 1000 * 60 * 45,
      });
      insertMessage({
        conversationId: convId,
        senderId: liam.id,
        type: 'call',
        body: '',
        callType: 'video',
        callStatus: 'completed',
        callDuration: 184,
        createdAt: now - 1000 * 60 * 35,
      });
    }
  }
}
