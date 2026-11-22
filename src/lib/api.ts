import {
  addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction,
  updateDoc, where,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from './firebase';
import type { CallHistoryItem, ConversationSummary, LinkPreview, MessageItem, PushStatusInfo, UserPublic } from '../shared/types';

const userFrom = (id: string, d: Record<string, any>): UserPublic => ({ id, username: d.username || '', avatarUrl: d.avatarUrl || null, bio: d.bio || null, online: Date.now() - Number(d.lastSeen || 0) < 90_000, lastSeen: Number(d.lastSeen || 0) });
const conversationId = (a: string, b: string) => [a, b].sort().join('_');
// Kept only for the legacy signaling hook; Firebase data calls do not use bearer tokens.
export function getStoredToken(): string | null { return null; }
const toMessage = (id: string, d: Record<string, any>): MessageItem => ({ id, conversationId: d.conversationId, senderId: d.senderId, senderUsername: d.senderUsername || '', type: d.type || 'text', body: d.body || '', mediaUrl: d.mediaUrl || null, mediaMime: d.mediaMime || null, mediaName: d.mediaName || null, linkUrl: d.linkUrl || null, linkTitle: d.linkTitle || null, linkDescription: d.linkDescription || null, linkDomain: d.linkDomain || null, callType: d.callType || null, callStatus: d.callStatus || null, callDuration: d.callDuration || null, createdAt: Number(d.createdAt || 0), readAt: d.readAt || null });

export const api = {
  async listConversations() {
    const uid = getAuth().currentUser?.uid;
    if (!uid) throw new Error('Sign in required.');
    const snap = await getDocs(query(collection(db, 'conversations'), where('memberIds', 'array-contains', uid)));
    const conversations: ConversationSummary[] = await Promise.all(snap.docs.map(async (s) => {
      const d = s.data(); const memberIds = d.memberIds as string[];
      const isGroup = Boolean(d.isGroup);
      const peerId = isGroup ? s.id : memberIds.find((id) => id !== uid)!;
      const peerSnap = isGroup ? null : await getDoc(doc(db, 'users', peerId));
      const last = d.lastMessage || null;
      const peer = isGroup
        ? userFrom(s.id, { username: d.groupName || 'Group', bio: `${memberIds.length} members` })
        : peerSnap?.exists() ? userFrom(peerId, peerSnap.data()) : userFrom(peerId, {});
      return { id: s.id, peer, isGroup, memberIds, lastMessage: last ? toMessage(last.id, last) : null, unreadCount: Number(d.unreadBy?.[uid] || 0), updatedAt: Number(d.updatedAt || 0) };
    }));
    return { conversations: conversations.sort((a,b) => b.updatedAt-a.updatedAt) };
  },
  async searchUsers(q: string) {
    const term = q.toLowerCase().replace(/^@+/, '').trim();
    const isLegend = getAuth().currentUser?.email === 'legend@users.famy-app.invalid';
    const filters = isLegend ? [] : [where('username', '!=', 'lucy')];
    const snap = await getDocs(query(collection(db, 'usernames'), ...filters, orderBy('username')));
    const currentUid = getAuth().currentUser?.uid;
    const users = await Promise.all(snap.docs.map(async (s) => { const d = s.data(); if (d.uid === currentUid) return null; const p = await getDoc(doc(db, 'users', d.uid)); return p.exists() ? userFrom(d.uid, p.data()) : null; }));
    return { users: users.filter((u): u is UserPublic => Boolean(u) && (!term || u!.username.includes(term))) };
  },
  async startConversation(username: string) {
    const auth = getAuth(); const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Sign in required.');
    const nameDoc = await getDoc(doc(db, 'usernames', username.toLowerCase()));
    if (!nameDoc.exists()) throw new Error('User not found.');
    const peerId = String(nameDoc.data().uid); if (peerId === uid) throw new Error('You cannot message yourself.');
    if (username.toLowerCase() === 'lucy' && auth.currentUser?.email !== 'legend@users.famy-app.invalid') throw new Error('This user is not available.');
    const id = conversationId(uid, peerId); const ref = doc(db, 'conversations', id);
    const [me, peer] = await Promise.all([getDoc(doc(db, 'users', uid)), getDoc(doc(db, 'users', peerId))]);
    if (!me.exists() || !peer.exists()) throw new Error('User profile unavailable.');
    await runTransaction(db, async (tx) => { const existing = await tx.get(ref); if (!existing.exists()) tx.set(ref, { memberIds: [uid, peerId].sort(), unreadBy: { [uid]: 0, [peerId]: 0 }, updatedAt: Date.now(), createdAt: Date.now() }); });
    return { conversation: { id, peer: userFrom(peerId, peer.data()), lastMessage: null, unreadCount: 0, updatedAt: Date.now() } as ConversationSummary };
  },
  async createGroup(name: string, memberIds: string[]) {
    const uid = getAuth().currentUser?.uid;
    if (!uid) throw new Error('Sign in required.');
    const title = name.trim();
    if (title.length < 2 || title.length > 40) throw new Error('Group name must be 2 to 40 characters.');
    const members = [...new Set([uid, ...memberIds])].sort();
    if (members.length < 2) throw new Error('Choose at least one person to add.');
    const profiles = await Promise.all(members.map((id) => getDoc(doc(db, 'users', id))));
    if (profiles.some((p) => !p.exists())) throw new Error('One or more selected profiles are unavailable.');
    const ref = await addDoc(collection(db, 'conversations'), {
      isGroup: true, groupName: title, memberIds: members,
      unreadBy: Object.fromEntries(members.map((id) => [id, 0])), createdBy: uid,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    return { conversation: { id: ref.id, peer: userFrom(ref.id, { username: title, bio: `${members.length} members` }), isGroup: true, memberIds: members, lastMessage: null, unreadCount: 0, updatedAt: Date.now() } as ConversationSummary };
  },
  async listMessages(id: string) {
    const snap = await getDocs(query(collection(db, 'conversations', id, 'messages'), orderBy('createdAt'), limit(300)));
    return { messages: snap.docs.map((s) => toMessage(s.id, s.data())) };
  },
  async sendMessage(id: string, payload: {body?:string;mediaUrl?:string;mediaMime?:string;mediaName?:string}) {
    const auth = getAuth(); const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Sign in required.');
    const profile = await getDoc(doc(db, 'users', uid)); if (!profile.exists()) throw new Error('Profile unavailable.');
    const convRef = doc(db, 'conversations', id); const conv = await getDoc(convRef);
    if (!conv.exists() || !conv.data().memberIds.includes(uid)) throw new Error('Conversation unavailable.');
    const type = payload.mediaMime?.startsWith('video/') ? 'video' : payload.mediaUrl ? 'image' : 'text';
    const message = { conversationId: id, senderId: uid, senderUsername: profile.data().username, type, body: payload.body || '', mediaUrl: payload.mediaUrl || null, mediaMime: payload.mediaMime || null, mediaName: payload.mediaName || null, createdAt: Date.now(), readAt: null };
    const ref = await addDoc(collection(db, 'conversations', id, 'messages'), message);
    const unreadBy = { ...(conv.data().unreadBy || {}) };
    for (const memberId of conv.data().memberIds as string[]) {
      if (memberId !== uid) unreadBy[memberId] = Number(unreadBy[memberId] || 0) + 1;
    }
    await updateDoc(convRef, { lastMessage: { ...message, id: ref.id }, updatedAt: message.createdAt, unreadBy });
    return { message: toMessage(ref.id, message) };
  },
  async uploadMedia(file: File) {
    const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME; const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!cloud || !preset) throw new Error('Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
    const form = new FormData(); form.append('file', file); form.append('upload_preset', preset);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, { method: 'POST', body: form });
    const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || 'Cloudinary upload failed.');
    return { url: data.secure_url as string, mime: file.type, name: file.name, kind: file.type.startsWith('video/') ? 'video' as const : 'image' as const };
  },
  async previewLink(url: string) { const parsed = new URL(url); return { preview: { url, title: parsed.hostname, description: '', domain: parsed.hostname } as LinkPreview }; },
  async listCalls() { return { calls: [] as CallHistoryItem[] }; },
  async getPushStatus() { return { vapidConfigured: false, subscriptionCount: 0 } as PushStatusInfo; },
  async getVapidPublicKey() { throw new Error('Push notifications are paused while core messaging is being set up.'); },
  async subscribePush() { throw new Error('Push notifications are paused.'); },
  async unsubscribePush() { return { ok: true, subscriptionCount: 0 }; },
  async testPush() { throw new Error('Push notifications are paused.'); },
};
