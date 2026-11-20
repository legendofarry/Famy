import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { sendNotification, setVapidDetails } from 'web-push';
import { WebSocket, WebSocketServer } from 'ws';
import {
  createSession,
  createFirebaseUser,
  createUser,
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  deleteSession,
  ensureStarterContactsAndChats,
  findUserById,
  findUserByFirebaseUid,
  findUserByUsername,
  getConversationMemberIds,
  getConversationMessages,
  getOrCreateDirectConversation,
  getOrCreateVapidKeys,
  getUserBySessionToken,
  getUserPushSubscriptions,
  insertMessage,
  isConversationMember,
  listUserCallHistory,
  listUserConversations,
  markConversationRead,
  savePushSubscription,
  searchUsers,
  seedWelcomeConversationsForNewUser,
  toPublicUser,
  updateLastSeen,
  verifyPassword,
} from './server/db.ts';
import type { UserRow } from './server/db.ts';
import { fetchLinkPreview } from './server/linkPreview.ts';
import type { CallMode, CallOutcome, MessageType } from './src/shared/types.ts';
import { extractUrls, validatePassword, validateUsername } from './src/shared/validation.ts';

dotenv.config();

if (getApps().length === 0) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  initializeApp(
    serviceAccountJson
      ? { credential: cert(JSON.parse(serviceAccountJson)), projectId: 'famy-app-ae3ce' }
      : { credential: applicationDefault(), projectId: 'famy-app-ae3ce' }
  );
}

const PORT = Number(process.env.PORT || 3000);
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

ensureStarterContactsAndChats();
const vapid = getOrCreateVapidKeys();
setVapidDetails('mailto:alerts@famy.app', vapid.publicKey, vapid.privateKey);

interface AuthedRequest extends Request {
  user?: UserRow;
  token?: string;
}

const userSockets = new Map<string, Set<WebSocket>>();

function getOnlineUserIds(): Set<string> {
  const online = new Set<string>();
  for (const [uid, sockets] of userSockets.entries()) {
    if (sockets.size > 0) online.add(uid);
  }
  return online;
}

function sendWs(userId: string, payload: unknown): boolean {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return false;
  const serialized = JSON.stringify(payload);
  let delivered = false;
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
      delivered = true;
    }
  }
  return delivered;
}

function broadcastPresence(userId: string, online: boolean): void {
  const lastSeen = Date.now();
  for (const [otherId] of userSockets.entries()) {
    if (otherId !== userId) {
      sendWs(otherId, {
        type: 'presence:update',
        userId,
        online,
        lastSeen,
      });
    }
  }
}

async function sendPushToUser(
  userId: string,
  payload: Record<string, unknown>,
  urgency: 'high' | 'normal' = 'normal'
): Promise<{ sent: number; failed: number }> {
  const subs = getUserPushSubscriptions(userId);
  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: urgency === 'high' ? 60 : 3600, urgency }
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          deletePushSubscriptionByEndpoint(sub.endpoint);
        }
      }
    })
  );

  return { sent, failed };
}

interface PendingCallRecord {
  callId: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  mode: CallMode;
  createdAt: number;
  connectedAt: number | null;
  finalized: boolean;
}

const activeCalls = new Map<string, PendingCallRecord>();

function finalizeCallLog(
  call: PendingCallRecord,
  outcome: CallOutcome,
  durationSeconds?: number
): void {
  if (call.finalized) return;
  call.finalized = true;
  activeCalls.delete(call.callId);

  const duration =
    typeof durationSeconds === 'number'
      ? Math.max(0, Math.floor(durationSeconds))
      : call.connectedAt
        ? Math.max(1, Math.round((Date.now() - call.connectedAt) / 1000))
        : 0;

  const msg = insertMessage({
    conversationId: call.conversationId,
    senderId: call.callerId,
    type: 'call',
    body: '',
    callType: call.mode,
    callStatus: outcome,
    callDuration: duration,
  });

  sendWs(call.callerId, { type: 'message:new', message: msg });
  sendWs(call.calleeId, { type: 'message:new', message: msg });
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const user = getUserBySessionToken(token);
  if (!user) {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }
  req.user = user;
  req.token = token;
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10) || '.bin';
    cb(null, `${Date.now()}_${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are supported.'));
    }
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // --- Auth Endpoints (Username + Password Only, Immediate Activation) ---
  app.post('/api/auth/firebase', async (req, res) => {
    const idToken = String(req.body?.idToken ?? '');
    if (!idToken) {
      res.status(400).json({ error: 'Firebase ID token is required.' });
      return;
    }

    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      let user = findUserByFirebaseUid(decoded.uid);

      if (!user) {
        const baseUsername =
          decoded.name ||
          (typeof decoded.email === 'string' ? decoded.email.split('@')[0] : '') ||
          `google_${decoded.uid.slice(0, 8)}`;
        user = createFirebaseUser(
          decoded.uid,
          baseUsername,
          typeof decoded.picture === 'string' ? decoded.picture : null,
          'On Famy'
        );
        seedWelcomeConversationsForNewUser(user.id);
      }

      updateLastSeen(user.id);
      const token = createSession(user.id);
      res.json({
        token,
        user: toPublicUser(user, new Set(getOnlineUserIds()).add(user.id)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Firebase authentication failed.';
      res.status(401).json({ error: message });
    }
  });

  app.post('/api/auth/signup', (req, res) => {
    const rawUsername = String(req.body?.username ?? '');
    const rawPassword = String(req.body?.password ?? '');

    const uCheck = validateUsername(rawUsername);
    if (!uCheck.ok) {
      res.status(400).json({ error: uCheck.error });
      return;
    }

    const pCheck = validatePassword(rawPassword);
    if (!pCheck.ok) {
      res.status(400).json({ error: pCheck.error });
      return;
    }

    const existing = findUserByUsername(uCheck.normalized);
    if (existing) {
      res.status(409).json({ error: `Username @${uCheck.normalized} is already taken.` });
      return;
    }

    const user = createUser(uCheck.normalized, rawPassword, null, 'On Famy');
    seedWelcomeConversationsForNewUser(user.id);
    const token = createSession(user.id);
    const onlineSet = getOnlineUserIds();
    onlineSet.add(user.id);

    res.status(201).json({
      token,
      user: toPublicUser(user, onlineSet),
    });
  });

  app.post('/api/auth/signin', (req, res) => {
    const rawUsername = String(req.body?.username ?? '');
    const rawPassword = String(req.body?.password ?? '');

    const uCheck = validateUsername(rawUsername);
    if (!uCheck.ok) {
      res.status(400).json({ error: uCheck.error });
      return;
    }

    if (!rawPassword) {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }

    const user = findUserByUsername(uCheck.normalized);
    if (!user || !verifyPassword(rawPassword, user.password_hash, user.password_salt)) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    updateLastSeen(user.id);
    const token = createSession(user.id);
    const onlineSet = getOnlineUserIds();
    onlineSet.add(user.id);

    res.json({
      token,
      user: toPublicUser(user, onlineSet),
    });
  });

  app.post('/api/auth/signout', requireAuth, (req: AuthedRequest, res) => {
    if (req.token) {
      deleteSession(req.token);
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const onlineSet = getOnlineUserIds();
    res.json({ user: toPublicUser(user, onlineSet) });
  });

  // --- Users & Conversations ---
  app.get('/api/users/search', requireAuth, (req: AuthedRequest, res) => {
    const q = String(req.query.q ?? '');
    const users = searchUsers(q, req.user!.id, getOnlineUserIds());
    res.json({ users });
  });

  app.get('/api/conversations', requireAuth, (req: AuthedRequest, res) => {
    const conversations = listUserConversations(req.user!.id, getOnlineUserIds());
    res.json({ conversations });
  });

  app.post('/api/conversations', requireAuth, (req: AuthedRequest, res) => {
    const rawUsername = String(req.body?.username ?? '');
    const uCheck = validateUsername(rawUsername);
    if (!uCheck.ok) {
      res.status(400).json({ error: uCheck.error });
      return;
    }

    const target = findUserByUsername(uCheck.normalized);
    if (!target) {
      res.status(404).json({ error: `No Famy user found with username @${uCheck.normalized}.` });
      return;
    }

    if (target.id === req.user!.id) {
      res.status(400).json({ error: 'Choose another username to start a conversation.' });
      return;
    }

    const conversationId = getOrCreateDirectConversation(req.user!.id, target.id);
    const conversations = listUserConversations(req.user!.id, getOnlineUserIds());
    const found = conversations.find((c) => c.id === conversationId);
    res.status(201).json({ conversation: found });
  });

  app.get('/api/conversations/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const convId = String(req.params.id);
    if (!isConversationMember(convId, req.user!.id)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    markConversationRead(convId, req.user!.id);
    const messages = getConversationMessages(convId);

    const members = getConversationMemberIds(convId);
    for (const memberId of members) {
      if (memberId !== req.user!.id) {
        sendWs(memberId, {
          type: 'conversation:read',
          conversationId: convId,
          readerId: req.user!.id,
          readAt: Date.now(),
        });
      }
    }

    res.json({ messages });
  });

  app.post('/api/conversations/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
    const convId = String(req.params.id);
    if (!isConversationMember(convId, req.user!.id)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const body = String(req.body?.body ?? '').trim();
    const mediaUrl = req.body?.mediaUrl ? String(req.body.mediaUrl) : null;
    const mediaMime = req.body?.mediaMime ? String(req.body.mediaMime) : null;
    const mediaName = req.body?.mediaName ? String(req.body.mediaName) : null;

    if (!body && !mediaUrl) {
      res.status(400).json({ error: 'Message text or media attachment is required.' });
      return;
    }

    let type: MessageType = 'text';
    let linkPreview = null;

    if (mediaUrl) {
      type = mediaMime?.startsWith('video/') ? 'video' : 'image';
    } else {
      const urls = extractUrls(body);
      if (urls.length > 0) {
        type = 'link';
        linkPreview = await fetchLinkPreview(urls[0]);
      }
    }

    const message = insertMessage({
      conversationId: convId,
      senderId: req.user!.id,
      type,
      body,
      mediaUrl,
      mediaMime,
      mediaName,
      link: linkPreview,
    });

    const members = getConversationMemberIds(convId);
    for (const memberId of members) {
      sendWs(memberId, { type: 'message:new', message });
      if (memberId !== req.user!.id) {
        const previewText =
          type === 'image'
            ? 'Sent a photo'
            : type === 'video'
              ? 'Sent a video'
              : body.slice(0, 120);
        void sendPushToUser(memberId, {
          kind: 'message',
          title: `@${req.user!.username}`,
          body: previewText,
          conversationId: convId,
          url: `/?chat=${encodeURIComponent(convId)}`,
        });
      }
    }

    res.status(201).json({ message });
  });

  app.post('/api/upload', requireAuth, upload.single('file'), (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No image or video file uploaded.' });
      return;
    }
    const mime = req.file.mimetype;
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      mime,
      name: req.file.originalname,
      kind: mime.startsWith('video/') ? 'video' : 'image',
    });
  });

  app.post('/api/links/preview', requireAuth, async (req, res) => {
    const rawUrl = String(req.body?.url ?? '').trim();
    const urls = extractUrls(rawUrl);
    if (urls.length === 0) {
      res.status(400).json({ error: 'Valid http or https URL is required.' });
      return;
    }
    const preview = await fetchLinkPreview(urls[0]);
    res.json({ preview });
  });

  app.get('/api/calls', requireAuth, (req: AuthedRequest, res) => {
    const calls = listUserCallHistory(req.user!.id, getOnlineUserIds());
    res.json({ calls });
  });

  app.post('/api/calls/decline', (req, res) => {
    const callId = String(req.body?.callId ?? '');
    const call = activeCalls.get(callId);
    if (call) {
      sendWs(call.callerId, { type: 'call:rejected', callId, reason: 'Declined from notification' });
      finalizeCallLog(call, 'declined', 0);
    }
    res.json({ ok: true });
  });

  // --- Web Push Endpoints ---
  app.get('/api/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: vapid.publicKey });
  });

  app.get('/api/push/status', requireAuth, (req: AuthedRequest, res) => {
    const subs = getUserPushSubscriptions(req.user!.id);
    res.json({
      vapidConfigured: Boolean(vapid.publicKey),
      subscriptionCount: subs.length,
    });
  });

  app.post('/api/push/subscribe', requireAuth, (req: AuthedRequest, res) => {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      res.status(400).json({ error: 'Invalid PushSubscription payload.' });
      return;
    }
    savePushSubscription(
      req.user!.id,
      {
        endpoint: String(sub.endpoint),
        keys: {
          p256dh: String(sub.keys.p256dh),
          auth: String(sub.keys.auth),
        },
      },
      req.headers['user-agent'] || null
    );
    const subs = getUserPushSubscriptions(req.user!.id);
    res.status(201).json({ ok: true, subscriptionCount: subs.length });
  });

  app.post('/api/push/unsubscribe', requireAuth, (req: AuthedRequest, res) => {
    const endpoint = req.body?.endpoint ? String(req.body.endpoint) : undefined;
    deletePushSubscription(req.user!.id, endpoint);
    const subs = getUserPushSubscriptions(req.user!.id);
    res.json({ ok: true, subscriptionCount: subs.length });
  });

  app.post('/api/push/test', requireAuth, async (req: AuthedRequest, res) => {
    const kind = req.body?.kind === 'call' ? 'call' : 'message';
    const result = await sendPushToUser(
      req.user!.id,
      kind === 'call'
        ? {
            kind: 'call',
            title: 'Incoming Famy Video Call',
            body: '@maya is calling you on Famy',
            callId: `test_${Date.now()}`,
            callerUsername: 'maya',
            callMode: 'video',
          }
        : {
            kind: 'message',
            title: 'Famy Notifications Ready',
            body: `Device alerts are active for @${req.user!.username}.`,
          },
      kind === 'call' ? 'high' : 'normal'
    );
    res.json({ ok: true, ...result });
  });

  // Error handler for multer / JSON
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ error: err.message || 'Request failed.' });
  });

  // --- Vite / Production Static ---
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // --- HTTP + WebSocket Server ---
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const token = url.searchParams.get('token');
    const user = token ? getUserBySessionToken(token) : undefined;

    if (!user) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    let set = userSockets.get(user.id);
    if (!set) {
      set = new Set();
      userSockets.set(user.id, set);
    }
    const wasOffline = set.size === 0;
    set.add(ws);
    updateLastSeen(user.id);

    if (wasOffline) {
      broadcastPresence(user.id, true);
    }

    ws.on('message', (raw) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(String(raw));
      } catch {
        return;
      }

      const type = String(data.type || '');

      if (type === 'typing:start' || type === 'typing:stop') {
        const convId = String(data.conversationId || '');
        if (!isConversationMember(convId, user.id)) return;
        for (const memberId of getConversationMemberIds(convId)) {
          if (memberId !== user.id) {
            sendWs(memberId, {
              type,
              conversationId: convId,
              userId: user.id,
              username: user.username,
            });
          }
        }
        return;
      }

      if (type === 'conversation:read') {
        const convId = String(data.conversationId || '');
        if (!isConversationMember(convId, user.id)) return;
        markConversationRead(convId, user.id);
        for (const memberId of getConversationMemberIds(convId)) {
          if (memberId !== user.id) {
            sendWs(memberId, {
              type: 'conversation:read',
              conversationId: convId,
              readerId: user.id,
              readAt: Date.now(),
            });
          }
        }
        return;
      }

      if (type === 'call:offer') {
        const callId = String(data.callId || `call_${crypto.randomUUID()}`);
        const conversationId = String(data.conversationId || '');
        const targetUserId = String(data.targetUserId || '');
        const mode: CallMode = data.mode === 'video' ? 'video' : 'audio';

        if (!conversationId || !targetUserId || !isConversationMember(conversationId, user.id)) {
          return;
        }

        const record: PendingCallRecord = {
          callId,
          conversationId,
          callerId: user.id,
          calleeId: targetUserId,
          mode,
          createdAt: Date.now(),
          connectedAt: null,
          finalized: false,
        };
        activeCalls.set(callId, record);

        const onlineSet = getOnlineUserIds();
        const deliveredLive = sendWs(targetUserId, {
          type: 'call:incoming',
          callId,
          conversationId,
          mode,
          sdp: data.sdp || null,
          caller: toPublicUser(user, onlineSet),
        });

        // Always dispatch Web Push so background/closed devices ring too!
        void sendPushToUser(
          targetUserId,
          {
            kind: 'call',
            title: mode === 'video' ? 'Incoming Famy Video Call' : 'Incoming Famy Voice Call',
            body: `@${user.username} is calling you`,
            callId,
            callerUsername: user.username,
            callMode: mode,
            conversationId,
          },
          'high'
        );

        sendWs(user.id, {
          type: 'call:ringing',
          callId,
          targetOnline: deliveredLive,
        });
        return;
      }

      if (type === 'call:answer') {
        const callId = String(data.callId || '');
        const call = activeCalls.get(callId);
        if (!call || call.calleeId !== user.id) return;
        call.connectedAt = Date.now();
        sendWs(call.callerId, {
          type: 'call:answered',
          callId,
          sdp: data.sdp || null,
        });
        return;
      }

      if (type === 'call:ice') {
        const callId = String(data.callId || '');
        const call = activeCalls.get(callId);
        if (!call) return;
        const recipientId = call.callerId === user.id ? call.calleeId : call.callerId;
        sendWs(recipientId, {
          type: 'call:ice',
          callId,
          candidate: data.candidate,
        });
        return;
      }

      if (type === 'call:reject') {
        const callId = String(data.callId || '');
        const call = activeCalls.get(callId);
        if (!call) return;
        sendWs(call.callerId, {
          type: 'call:rejected',
          callId,
          reason: String(data.reason || 'Call declined'),
        });
        finalizeCallLog(call, 'declined', 0);
        return;
      }

      if (type === 'call:end') {
        const callId = String(data.callId || '');
        const call = activeCalls.get(callId);
        if (!call) return;
        const otherId = call.callerId === user.id ? call.calleeId : call.callerId;
        sendWs(otherId, {
          type: 'call:ended',
          callId,
        });
        const clientDuration =
          typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined;
        const outcome: CallOutcome = call.connectedAt || (clientDuration && clientDuration > 0)
          ? 'completed'
          : call.callerId === user.id
            ? 'cancelled'
            : 'missed';
        finalizeCallLog(call, outcome, clientDuration);
      }
    });

    ws.on('close', () => {
      const current = userSockets.get(user.id);
      if (current) {
        current.delete(ws);
        if (current.size === 0) {
          userSockets.delete(user.id);
          updateLastSeen(user.id);
          broadcastPresence(user.id, false);
        }
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Famy server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Famy server:', err);
  process.exit(1);
});
