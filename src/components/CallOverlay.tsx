import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import type { ActiveCallState } from '../shared/types';
import { formatCallDuration } from '../shared/validation';
import { Avatar } from './Avatar';

interface CallOverlayProps {
  call: ActiveCallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micMuted: boolean;
  cameraOff: boolean;
  mediaNotice: string | null;
  elapsedSeconds: number;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  call,
  localStream,
  remoteStream,
  micMuted,
  cameraOff,
  mediaNotice,
  elapsedSeconds,
  onAccept,
  onReject,
  onEnd,
  onToggleMic,
  onToggleCamera,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const hasRemoteVideo = Boolean(remoteStream && remoteStream.getVideoTracks().length > 0);
  const hasLocalVideo = Boolean(
    localStream && localStream.getVideoTracks().length > 0 && !cameraOff
  );

  const statusLine =
    call.phase === 'incoming'
      ? `Incoming ${call.mode === 'video' ? 'video' : 'voice'} call`
      : call.phase === 'outgoing'
        ? 'Ringing...'
        : call.phase === 'connecting'
          ? 'Connecting...'
          : call.phase === 'ended'
            ? call.endReason || 'Call ended'
            : formatCallDuration(elapsedSeconds);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${call.mode} call with @${call.peer.username}`}
      className="fixed inset-0 z-50 bg-[#0D1614] text-white flex flex-col justify-between p-6 sm:p-10"
    >
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Remote Video Background when active */}
      {call.mode === 'video' && hasRemoteVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Subtle readability gradient over video */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/75 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" aria-hidden="true" />
          <span className="font-display text-sm font-medium text-white/85">
            Famy {call.mode === 'video' ? 'Video Call' : 'Voice Call'}
          </span>
        </div>

        {mediaNotice && (
          <span className="text-xs text-amber-200 bg-black/45 px-3 py-1.5 rounded-lg">
            {mediaNotice}
          </span>
        )}
      </div>

      {/* Center Caller Info */}
      <div className="relative z-10 flex flex-col items-center text-center space-y-4 my-auto">
        {(!hasRemoteVideo || call.mode === 'audio') && (
          <div className="p-2 rounded-full ring-2 ring-[#14B8A6]/40">
            <Avatar
              username={call.peer.username}
              avatarUrl={call.peer.avatarUrl}
              online={call.peer.online}
              size="xl"
            />
          </div>
        )}

        <div className="space-y-1">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            @{call.peer.username}
          </h2>
          <p className="text-base text-[#99F6E4] tabular-nums">{statusLine}</p>
        </div>
      </div>

      {/* Local Camera Preview Picture-in-Picture */}
      {call.mode === 'video' && hasLocalVideo && (
        <div className="relative z-10 self-end mb-4 w-28 sm:w-36 aspect-[3/4] rounded-2xl overflow-hidden border border-white/25 bg-black shadow-2xl">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover -scale-x-100"
          />
        </div>
      )}

      {/* Call Controls */}
      <div className="relative z-10 flex items-center justify-center gap-4 sm:gap-6 pb-safe">
        {call.phase === 'incoming' ? (
          <>
            <button
              type="button"
              onClick={onReject}
              aria-label="Decline call"
              className="min-w-[64px] min-h-[64px] px-6 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer"
            >
              <PhoneOff className="w-6 h-6" />
              <span className="text-sm">Decline</span>
            </button>

            <button
              type="button"
              onClick={onAccept}
              aria-label="Accept call"
              className="min-w-[64px] min-h-[64px] px-6 rounded-full bg-[#0F766E] hover:bg-[#0D9488] text-white flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer"
            >
              {call.mode === 'video' ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
              <span className="text-sm">Accept</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMic}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                micMuted ? 'bg-white text-[#111815]' : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
            >
              {micMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            {call.mode === 'video' && (
              <button
                type="button"
                onClick={onToggleCamera}
                aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                className={`min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  cameraOff ? 'bg-white text-[#111815]' : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
              >
                {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>
            )}

            <button
              type="button"
              onClick={onEnd}
              aria-label="End call"
              className="min-w-[64px] min-h-[56px] px-6 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer"
            >
              <PhoneOff className="w-6 h-6" />
              <span className="text-sm">End</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
