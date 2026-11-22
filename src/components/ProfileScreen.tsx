import React, { useRef, useState } from 'react';
import { Camera, LoaderCircle, Save, X } from 'lucide-react';
import type { UserPublic } from '../shared/types';
import { validateUsername } from '../shared/validation';
import { api } from '../lib/api';
import { updateFamyProfile } from '../lib/firebaseAuth';
import { Avatar } from './Avatar';

interface ProfileScreenProps {
  user: UserPublic;
  onClose: () => void;
  onUpdated: (user: UserPublic) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ user, onClose, onUpdated }) => {
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.uploadMedia(file);
      setAvatarUrl(result.url);
      setNotice('Photo uploaded. Save your profile to apply it.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload your photo.');
    } finally { setBusy(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setNotice(null);
    const checked = validateUsername(username);
    if (!checked.ok) { setError(checked.error || 'Enter a valid username.'); return; }
    setBusy(true);
    try {
      const updated = await updateFamyProfile({ username: checked.normalized, bio, avatarUrl });
      onUpdated(updated); setNotice('Your profile is saved.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save your profile.';
      setError(message.includes('requires-recent-login') ? 'For security, sign out and sign in again before changing your username.' : message);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Edit profile">
      <section className="profile-panel w-full max-w-lg overflow-hidden rounded-t-[28px] border border-white/60 bg-white shadow-2xl sm:rounded-[28px]">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-700">Your account</p><h2 className="mt-1 font-display text-2xl font-semibold text-slate-950">Edit profile</h2></div>
          <button className="grid h-10 w-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close profile"><X size={20} /></button>
        </header>
        <form onSubmit={save} className="space-y-5 p-5 sm:p-7">
          <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
            <Avatar username={username || user.username} avatarUrl={avatarUrl} size="lg" />
            <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">Profile photo</p><p className="text-xs text-slate-500">Choose a clear image so friends recognize you.</p></div>
            <input ref={fileRef} className="hidden" type="file" accept="image/*" onChange={(e) => { void uploadAvatar(e.target.files?.[0]); e.currentTarget.value = ''; }} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-teal-300 disabled:opacity-50"><Camera size={16} /> Change</button>
          </div>
          <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-800">Username</span><div className="flex h-12 items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/15"><span className="text-slate-400">@</span><input className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-900 outline-none" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" /></div><span className="block text-xs text-slate-500">3–24 letters, numbers, or underscores. Usernames must be unique.</span></label>
          <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-800">About you</span><textarea className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15" maxLength={160} placeholder="A little about yourself…" value={bio} onChange={(e) => setBio(e.target.value)} /><span className="block text-right text-xs text-slate-400">{bio.length}/160</span></label>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
          <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 disabled:opacity-60">
            {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}{busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>
    </div>
  );
};
