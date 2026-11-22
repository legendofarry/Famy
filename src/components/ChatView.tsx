import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ExternalLink,
  Film,
  ImagePlus,
  Link2,
  Phone,
  Send,
  Video,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  CallMode,
  ConversationSummary,
  LinkPreview,
  MessageItem,
  UserPublic,
} from '../shared/types';
import { extractUrls, formatCallDuration, formatMessageTime } from '../shared/validation';
import { Avatar } from './Avatar';

interface ChatViewProps {
  currentUser: UserPublic;
  conversation: ConversationSummary;
  messages: MessageItem[];
  loading: boolean;
  peerTyping: boolean;
  onBackMobile: () => void;
  onSendMessage: (payload: {
    body?: string;
    mediaUrl?: string;
    mediaMime?: string;
    mediaName?: string;
  }) => Promise<void>;
  onTypingChange: (typing: boolean) => void;
  onStartCall: (mode: CallMode) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  currentUser,
  conversation,
  messages,
  loading,
  peerTyping,
  onBackMobile,
  onSendMessage,
  onTypingChange,
  onStartCall,
}) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<{
    url: string;
    mime: string;
    name: string;
    kind: 'image' | 'video';
  } | null>(null);
  const [draftLinkPreview, setDraftLinkPreview] = useState<LinkPreview | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, peerTyping, conversation.id]);

  // Detect URL in draft for live link preview card
  useEffect(() => {
    const urls = extractUrls(draft);
    if (urls.length === 0) {
      setDraftLinkPreview(null);
      return;
    }
    const target = urls[0];
    let active = true;
    const timer = window.setTimeout(() => {
      api
        .previewLink(target)
        .then((res) => {
          if (active) setDraftLinkPreview(res.preview);
        })
        .catch(() => {});
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft]);

  const handleTextChange = (val: string) => {
    setDraft(val);
    onTypingChange(true);
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      onTypingChange(false);
    }, 1800);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    try {
      const uploaded = await api.uploadMedia(file);
      setPendingMedia(uploaded);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload file.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed && !pendingMedia) return;
    if (sending) return;

    setSending(true);
    setUploadError(null);
    onTypingChange(false);
    try {
      await onSendMessage({
        body: trimmed,
        mediaUrl: pendingMedia?.url,
        mediaMime: pendingMedia?.mime,
        mediaName: pendingMedia?.name,
      });
      setDraft('');
      setPendingMedia(null);
      setDraftLinkPreview(null);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Message failed to send.');
    } finally {
      setSending(false);
    }
  };

  const renderLinkifiedText = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi);
    return parts.map((part, idx) => {
      if (/^https?:\/\//i.test(part)) {
        return (
          <a
            key={idx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 text-[#0F766E] dark:text-[#5EEAD4] break-all"
          >
            {part}
          </a>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  const peer = conversation.peer;
  const statusText = conversation.isGroup
    ? `${conversation.memberIds?.length || 2} members`
    : peerTyping
    ? 'typing...'
    : peer.online
      ? 'Online'
      : `Last seen ${formatMessageTime(peer.lastSeen)}`;

  return (
    <section className="flex-1 flex flex-col h-full min-w-0 bg-[#EFECE6] dark:bg-[#0D1412]">
      {/* Chat Header */}
      <header className="h-16 px-3 sm:px-5 shrink-0 bg-white dark:bg-[#111917] border-b border-[#E2E6E1] dark:border-[#24322D] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label="Back to conversations"
            className="md:hidden min-w-[44px] min-h-[44px] -ml-1 rounded-xl flex items-center justify-center text-[#33413C] dark:text-[#CBD5D0] hover:bg-[#F2F4F2] dark:hover:bg-[#1E2B27] cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <Avatar username={peer.username} avatarUrl={peer.avatarUrl} online={peer.online} size="sm" />
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-base truncate leading-tight">
              {conversation.isGroup ? peer.username : `@${peer.username}`}
            </h2>
            <p
              className={`text-xs truncate ${
                peerTyping || peer.online
                  ? 'text-[#0F766E] dark:text-[#5EEAD4]'
                  : 'text-[#5B6862] dark:text-[#9AA8A1]'
              }`}
            >
              {statusText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!conversation.isGroup && <button
            type="button"
            onClick={() => onStartCall('audio')}
            aria-label={`Start voice call with @${peer.username}`}
            title="Voice call"
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl flex items-center justify-center gap-1.5 text-sm font-medium text-[#0F766E] dark:text-[#5EEAD4] hover:bg-[#ECF6F3] dark:hover:bg-[#182924] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Phone className="w-4 h-4" />
            <span className="hidden sm:inline">Call</span>
          </button>}
          {!conversation.isGroup && <button
            type="button"
            onClick={() => onStartCall('video')}
            aria-label={`Start video call with @${peer.username}`}
            title="Video call"
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl flex items-center justify-center gap-1.5 text-sm font-medium bg-[#0F766E] hover:bg-[#0D655E] text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <Video className="w-4 h-4" />
            <span className="hidden sm:inline">Video</span>
          </button>}
        </div>
      </header>

      {/* Scrollable Message Thread */}
      <div className="flex-1 overflow-y-auto chat-wallpaper px-3 sm:px-6 py-5 space-y-3">
        {loading ? (
          <div className="py-12 text-center text-sm text-[#5B6862] dark:text-[#9AA8A1]">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="py-14 text-center max-w-sm mx-auto space-y-2">
            <p className="font-display text-base font-medium text-[#33413C] dark:text-[#CBD5D0]">
              {conversation.isGroup ? `Say hello to ${peer.username}` : `Say hello to @${peer.username}`}
            </p>
            <p className="text-xs text-[#5B6862] dark:text-[#9AA8A1]">
              Send a message, photo, video, link, or start an instant voice or video call.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === currentUser.id;

            if (msg.type === 'call') {
              const label = msg.callType === 'video' ? 'Video call' : 'Voice call';
              const detail =
                msg.callStatus === 'completed' && msg.callDuration
                  ? formatCallDuration(msg.callDuration)
                  : msg.callStatus || 'ended';
              return (
                <div key={msg.id} className="flex justify-center py-1">
                  <div className="px-3.5 py-2 rounded-xl bg-white/85 dark:bg-[#16201D]/90 border border-[#E2E6E1] dark:border-[#24322D] text-xs text-[#33413C] dark:text-[#CBD5D0] flex items-center gap-2 tabular-nums">
                    {msg.callType === 'video' ? (
                      <Video className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#5EEAD4]" aria-hidden="true" />
                    ) : (
                      <Phone className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#5EEAD4]" aria-hidden="true" />
                    )}
                    <span className="font-medium">{label}</span>
                    <span aria-hidden="true">·</span>
                    <span>{detail}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#6B7872]">{formatMessageTime(msg.createdAt)}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <article
                  className={`max-w-[85%] sm:max-w-[70%] lg:max-w-[60%] rounded-2xl px-3.5 py-2.5 shadow-2xs space-y-2 ${
                    isMine
                      ? 'bg-[#D9F3EA] dark:bg-[#114B44] text-[#0F2922] dark:text-[#ECFDF5] rounded-br-md'
                      : 'bg-white dark:bg-[#16201D] text-[#111815] dark:text-[#F1F5F3] rounded-bl-md border border-[#E6E9E5] dark:border-[#22302B]'
                  }`}
                >
                  {conversation.isGroup && !isMine && (
                    <p className="text-[11px] font-semibold text-[#0F766E] dark:text-[#5EEAD4]">@{msg.senderUsername}</p>
                  )}
                  {/* Image Attachment */}
                  {msg.type === 'image' && msg.mediaUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImage({ url: msg.mediaUrl!, caption: msg.body || msg.mediaName || 'Shared image' })
                      }
                      className="block rounded-xl overflow-hidden bg-black/5 focus:outline-none focus:ring-2 focus:ring-[#0F766E] cursor-pointer"
                    >
                      <img
                        src={msg.mediaUrl}
                        alt={msg.body || msg.mediaName || 'Shared photo'}
                        referrerPolicy="no-referrer"
                        className="max-h-72 w-full object-cover"
                      />
                    </button>
                  )}

                  {/* Video Attachment */}
                  {msg.type === 'video' && msg.mediaUrl && (
                    <div className="rounded-xl overflow-hidden bg-black">
                      <video
                        src={msg.mediaUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="max-h-72 w-full"
                      />
                    </div>
                  )}

                  {/* Rich Link Card */}
                  {msg.linkUrl && (
                    <a
                      href={msg.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.1] transition-colors space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#0F766E] dark:text-[#5EEAD4]">
                        <span className="truncate">{msg.linkDomain || msg.linkUrl}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-semibold leading-snug line-clamp-2">
                        {msg.linkTitle || msg.linkUrl}
                      </p>
                      {msg.linkDescription && (
                        <p className="text-xs opacity-80 line-clamp-2">{msg.linkDescription}</p>
                      )}
                    </a>
                  )}

                  {/* Text Body */}
                  {msg.body && (
                    <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">
                      {renderLinkifiedText(msg.body)}
                    </p>
                  )}

                  {/* Timestamp & Read State */}
                  <div className="flex items-center justify-end gap-1 text-[11px] opacity-70 tabular-nums">
                    <span>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMine &&
                      (msg.readAt ? (
                        <CheckCheck
                          className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#5EEAD4]"
                          aria-label="Read"
                        />
                      ) : (
                        <Check className="w-3.5 h-3.5" aria-label="Sent" />
                      ))}
                  </div>
                </article>
              </div>
            );
          })
        )}

        {peerTyping && (
          <div className="flex justify-start">
            <div className="px-3.5 py-2 rounded-2xl bg-white dark:bg-[#16201D] border border-[#E6E9E5] dark:border-[#22302B] text-xs text-[#5B6862] dark:text-[#9AA8A1]">
              @{peer.username} is typing...
            </div>
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Composer Area */}
      <footer className="bg-white dark:bg-[#111917] border-t border-[#E2E6E1] dark:border-[#24322D] p-2.5 sm:px-4 sm:py-3 shrink-0 space-y-2">
        {uploadError && (
          <div
            role="alert"
            className="px-3 py-2 rounded-xl bg-[#FEF2F2] dark:bg-[#3B1518] text-xs text-[#B91C1C] dark:text-[#FCA5A5] flex items-center justify-between gap-2"
          >
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              aria-label="Dismiss error"
              className="p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {pendingMedia && (
          <div className="p-2.5 rounded-xl bg-[#F4F6F4] dark:bg-[#18231F] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {pendingMedia.kind === 'image' ? (
                <img
                  src={pendingMedia.url}
                  alt={pendingMedia.name}
                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-[#0F766E]/15 text-[#0F766E] flex items-center justify-center shrink-0">
                  <Film className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{pendingMedia.name}</p>
                <p className="text-[11px] text-[#5B6862] dark:text-[#9AA8A1]">
                  Ready to send ({pendingMedia.kind})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingMedia(null)}
              aria-label="Remove attachment"
              className="min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-[#5B6862] hover:bg-black/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {draftLinkPreview && !pendingMedia && (
          <div className="p-2.5 rounded-xl bg-[#F4F6F4] dark:bg-[#18231F] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link2 className="w-4 h-4 text-[#0F766E] shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{draftLinkPreview.title}</p>
                <p className="text-[11px] text-[#5B6862] dark:text-[#9AA8A1] truncate">
                  {draftLinkPreview.domain}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDraftLinkPreview(null)}
              aria-label="Hide link preview"
              className="p-1.5 text-[#5B6862] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach image or video"
            title="Send photo or video"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#4D5B55] dark:text-[#B4C2BC] hover:bg-[#F2F4F2] dark:hover:bg-[#1C2723] disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
          >
            <ImagePlus className="w-5 h-5" />
          </button>

          <textarea
            rows={1}
            aria-label="Message input"
            value={draft}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={uploading ? 'Uploading media...' : 'Message or paste a link...'}
            className="flex-1 min-h-[44px] max-h-32 px-4 py-2.5 leading-6 rounded-xl bg-[#F3F5F2] dark:bg-[#17211D] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />

          <button
            type="submit"
            disabled={sending || uploading || (!draft.trim() && !pendingMedia)}
            aria-label="Send message"
            className="min-w-[44px] min-h-[44px] px-4 rounded-xl bg-[#0F766E] hover:bg-[#0D655E] disabled:opacity-40 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            aria-label="Close image preview"
            className="self-end min-w-[44px] min-h-[44px] rounded-xl bg-white/10 text-white flex items-center justify-center mb-3 cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.caption}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-full rounded-xl object-contain"
          />
          {lightboxImage.caption && (
            <p className="mt-3 text-sm text-white/90 text-center max-w-lg">
              {lightboxImage.caption}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
