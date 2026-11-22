import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { auth, authReady, db } from './firebase';
import type { UserPublic } from '../shared/types';

// The product uses usernames instead of email addresses. Firebase Auth still
// requires an email identifier, so usernames map to a private synthetic one.
const emailForUsername = (username: string) => `${username.toLowerCase()}@users.famy-app.invalid`;

function toUser(data: Record<string, unknown>, uid: string): UserPublic {
  return {
    id: uid,
    username: String(data.username || ''),
    avatarUrl: (data.avatarUrl as string | null) || null,
    bio: (data.bio as string | null) || null,
    online: true,
    lastSeen: Date.now(),
  };
}

export async function createFamyAccount(username: string, password: string): Promise<UserPublic> {
  await authReady;
  const usernameRef = doc(db, 'usernames', username.toLowerCase());
  const credential = await createUserWithEmailAndPassword(auth, emailForUsername(username), password);
  try {
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(usernameRef);
      if (current.exists()) throw new Error(`Username @${username} is already taken.`);
      transaction.set(usernameRef, { uid: credential.user.uid, username: username.toLowerCase() });
      transaction.set(doc(db, 'users', credential.user.uid), {
        uid: credential.user.uid,
        username: username.toLowerCase(),
        avatarUrl: null,
        bio: null,
        createdAt: Date.now(),
        lastSeen: Date.now(),
      });
    });
  } catch (error) {
    await deleteUser(credential.user).catch(() => undefined);
    throw error;
  }
  return { id: credential.user.uid, username: username.toLowerCase(), avatarUrl: null, bio: null, online: true, lastSeen: Date.now() };
}

export async function signInFamyAccount(username: string, password: string): Promise<UserPublic> {
  await authReady;
  const credential = await signInWithEmailAndPassword(auth, emailForUsername(username), password);
  const profile = await getDoc(doc(db, 'users', credential.user.uid));
  if (!profile.exists()) {
    await signOut(auth);
    throw new Error('This account profile is missing. Contact support.');
  }
  await updateDoc(profile.ref, { lastSeen: Date.now() });
  return toUser(profile.data(), credential.user.uid);
}

export async function getSignedInProfile(): Promise<UserPublic | null> {
  await authReady;
  if (!auth.currentUser) return null;
  const profile = await getDoc(doc(db, 'users', auth.currentUser.uid));
  return profile.exists() ? toUser(profile.data(), auth.currentUser.uid) : null;
}

export async function signOutFamy(): Promise<void> {
  await signOut(auth);
}
