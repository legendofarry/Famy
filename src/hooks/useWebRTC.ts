import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveCallState, CallMode, UserPublic } from '../shared/types';

interface UseWebRTCOptions {
  sendSignal: (payload: Record<string, unknown>) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useWebRTC({ sendSignal }: UseWebRTCOptions) {
  const [callState, setCallState] = useState<ActiveCallState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callStateRef = useRef<ActiveCallState | null>(null);
  const pendingOfferSdpRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const ringtoneTimerRef = useRef<number | null>(null);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const stopRingtone = useCallback(() => {
    if (ringtoneTimerRef.current !== null) {
      window.clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
  }, []);

  const startRingtone = useCallback(() => {
    stopRingtone();
    const playTone = () => {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.16);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.46);
        setTimeout(() => ctx.close().catch(() => {}), 600);
      } catch {
        // Browser may restrict autoplay audio before user gesture
      }
    };
    playTone();
    ringtoneTimerRef.current = window.setInterval(playTone, 2400);
  }, [stopRingtone]);

  const cleanupMedia = useCallback(() => {
    stopRingtone();
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    pendingOfferSdpRef.current = null;
    pendingIceRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setMicMuted(false);
    setCameraOff(false);
    setMediaNotice(null);
  }, [stopRingtone]);

  useEffect(() => {
    if (callState?.phase !== 'connected' || !callState.startedAt) {
      setElapsedSeconds(0);
      return;
    }
    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - callState.startedAt!) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [callState?.phase, callState?.startedAt]);

  const acquireMedia = useCallback(async (mode: CallMode): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaNotice('Camera and microphone API unavailable in this browser context.');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video',
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaNotice(null);
      return stream;
    } catch {
      if (mode === 'video') {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = audioOnly;
          setLocalStream(audioOnly);
          setCameraOff(true);
          setMediaNotice('Camera unavailable — continuing with audio.');
          return audioOnly;
        } catch {
          setMediaNotice('Microphone/camera permission unavailable — signaling in listen-only mode.');
          return null;
        }
      }
      setMediaNotice('Microphone permission unavailable — signaling in listen-only mode.');
      return null;
    }
  }, []);

  const createPeerConnection = useCallback(
    (callId: string, stream: MediaStream | null) => {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      const remote = new MediaStream();
      setRemoteStream(remote);

      pc.ontrack = (ev) => {
        ev.streams[0]?.getTracks().forEach((track) => {
          remote.addTrack(track);
        });
        setRemoteStream(new MediaStream(remote.getTracks()));
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendSignal({
            type: 'call:ice',
            callId,
            candidate: ev.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          stopRingtone();
          setCallState((prev) =>
            prev
              ? { ...prev, phase: 'connected', startedAt: prev.startedAt ?? Date.now() }
              : prev
          );
        }
      };

      return pc;
    },
    [sendSignal, stopRingtone]
  );

  const startCall = useCallback(
    async (conversationId: string, peer: UserPublic, mode: CallMode) => {
      const callId = `call_${crypto.randomUUID()}`;
      setCallState({
        callId,
        conversationId,
        peer,
        mode,
        phase: 'outgoing',
        startedAt: null,
      });
      startRingtone();

      const stream = await acquireMedia(mode);
      const pc = createPeerConnection(callId, stream);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: mode === 'video',
      });
      await pc.setLocalDescription(offer);

      sendSignal({
        type: 'call:offer',
        callId,
        conversationId,
        targetUserId: peer.id,
        mode,
        sdp: offer,
      });
    },
    [acquireMedia, createPeerConnection, sendSignal, startRingtone]
  );

  const acceptIncomingCall = useCallback(async () => {
    const current = callStateRef.current;
    if (!current || current.phase !== 'incoming') return;
    stopRingtone();

    setCallState({ ...current, phase: 'connecting' });
    const stream = await acquireMedia(current.mode);
    const pc = createPeerConnection(current.callId, stream);

    const offerSdp = pendingOfferSdpRef.current;
    if (offerSdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      for (const cand of pendingIceRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      }
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal({
        type: 'call:answer',
        callId: current.callId,
        sdp: answer,
      });
    } else {
      sendSignal({
        type: 'call:answer',
        callId: current.callId,
        sdp: null,
      });
    }

    setCallState((prev) =>
      prev ? { ...prev, phase: 'connected', startedAt: Date.now() } : prev
    );
  }, [acquireMedia, createPeerConnection, sendSignal, stopRingtone]);

  const rejectIncomingCall = useCallback(() => {
    const current = callStateRef.current;
    if (!current) return;
    sendSignal({
      type: 'call:reject',
      callId: current.callId,
      reason: 'Declined',
    });
    cleanupMedia();
    setCallState(null);
  }, [cleanupMedia, sendSignal]);

  const endCall = useCallback(() => {
    const current = callStateRef.current;
    if (!current) return;
    const dur = current.startedAt ? Math.max(1, Math.round((Date.now() - current.startedAt) / 1000)) : 0;
    sendSignal({
      type: 'call:end',
      callId: current.callId,
      durationSeconds: dur,
    });
    cleanupMedia();
    setCallState(null);
  }, [cleanupMedia, sendSignal]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      setMicMuted((m) => !m);
      return;
    }
    const nextMuted = !micMuted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  }, [micMuted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      setCameraOff((c) => !c);
      return;
    }
    const nextOff = !cameraOff;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !nextOff;
    });
    setCameraOff(nextOff);
  }, [cameraOff]);

  const handleCallSignal = useCallback(
    async (event: Record<string, unknown>) => {
      const type = String(event.type || '');

      if (type === 'call:incoming') {
        const caller = event.caller as UserPublic;
        const callId = String(event.callId);
        const conversationId = String(event.conversationId);
        const mode: CallMode = event.mode === 'video' ? 'video' : 'audio';

        if (callStateRef.current && callStateRef.current.phase !== 'idle') {
          sendSignal({ type: 'call:reject', callId, reason: 'Busy on another call' });
          return;
        }

        pendingOfferSdpRef.current = (event.sdp as RTCSessionDescriptionInit) || null;
        pendingIceRef.current = [];
        setCallState({
          callId,
          conversationId,
          peer: caller,
          mode,
          phase: 'incoming',
          startedAt: null,
        });
        startRingtone();
        return;
      }

      if (type === 'call:answered') {
        const current = callStateRef.current;
        if (!current || current.callId !== event.callId) return;
        stopRingtone();
        const pc = pcRef.current;
        const answerSdp = event.sdp as RTCSessionDescriptionInit | null;
        if (pc && answerSdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(answerSdp)).catch(() => {});
          for (const cand of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          pendingIceRef.current = [];
        }
        setCallState((prev) =>
          prev ? { ...prev, phase: 'connected', startedAt: Date.now() } : prev
        );
        return;
      }

      if (type === 'call:ice') {
        const current = callStateRef.current;
        if (!current || current.callId !== event.callId) return;
        const cand = event.candidate as RTCIceCandidateInit | undefined;
        if (!cand) return;
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        } else {
          pendingIceRef.current.push(cand);
        }
        return;
      }

      if (type === 'call:rejected' || type === 'call:ended') {
        const current = callStateRef.current;
        if (!current || current.callId !== event.callId) return;
        cleanupMedia();
        setCallState({
          ...current,
          phase: 'ended',
          endReason: type === 'call:rejected' ? String(event.reason || 'Call declined') : 'Call ended',
        });
        window.setTimeout(() => {
          setCallState((latest) => (latest?.callId === current.callId ? null : latest));
        }, 1600);
      }
    },
    [cleanupMedia, sendSignal, startRingtone, stopRingtone]
  );

  return {
    callState,
    localStream,
    remoteStream,
    micMuted,
    cameraOff,
    mediaNotice,
    elapsedSeconds,
    startCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endCall,
    toggleMic,
    toggleCamera,
    handleCallSignal,
  };
}
