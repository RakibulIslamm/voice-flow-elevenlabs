'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Conversation,
  type DisconnectionDetails,
  type Mode,
} from '@elevenlabs/client';

// The SDK's MessagePayload type isn't re-exported from the package root,
// so we inline the subset we actually read in onMessage. `role` is the
// canonical post-0.x field; `source` is kept for older SDK builds that
// haven't migrated callers yet.
type SdkMessagePayload = {
  message: string;
  role?: 'user' | 'agent';
  source?: 'user' | 'ai';
};
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  RefreshCcw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { reportClientError } from '@/lib/tracking/client-report';
import type { TalkAgent } from './talk-shell';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type VoiceState =
  | 'idle'
  | 'permission-prompt'
  | 'permission-denied'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'ended'
  | 'error';

type TranscriptRole = 'user' | 'assistant';
type TranscriptEntry = { role: TranscriptRole; text: string; ts: number };

type ConversationInstance = Awaited<ReturnType<typeof Conversation.startSession>>;

const ACTIVE_STATES = new Set<VoiceState>(['listening', 'thinking', 'speaking']);

// ---------------------------------------------------------------------------
// VoiceUI
// ---------------------------------------------------------------------------

export function VoiceUI({ agent }: { agent: TalkAgent }) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // The ListeningWaveform pulls byte-frequency data from the SDK's input
  // analyser via this function. `null` while not in an active call.
  const [getLevels, setGetLevels] = useState<(() => Uint8Array) | null>(null);

  // Mutable session refs — kept off React state so they never trigger
  // re-renders and we can read fresh values inside the SDK callbacks
  // even after the closing render has scheduled a state update.
  const conversationRef = useRef<ConversationInstance | null>(null);
  const widgetTokenRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);

  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Hard-stop any active conversation on unmount (route change, refresh).
  // Leaving the SDK running keeps the mic indicator on and the ElevenLabs
  // session alive — both burn caller trust and the owner's quota.
  useEffect(() => {
    return () => {
      conversationRef.current?.endSession().catch(() => {});
      conversationRef.current = null;
    };
  }, []);

  // Auto-scroll the transcript whenever a new entry lands.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [transcript.length, state]);

  const persistTranscriptTurn = useCallback(
    (role: TranscriptRole, content: string) => {
      const tok = widgetTokenRef.current;
      const cid = callIdRef.current;
      if (!tok || !cid) return;
      void fetch('/api/widget/transcript', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ widgetToken: tok, callId: cid, role, content }),
        keepalive: true,
      }).catch(() => {});
    },
    [],
  );

  const fireEndCallBeacon = useCallback(() => {
    const tok = widgetTokenRef.current;
    const cid = callIdRef.current;
    if (!tok || !cid) return;
    void fetch('/api/widget/end-call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ widgetToken: tok, callId: cid }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const teardown = useCallback(() => {
    conversationRef.current?.endSession().catch(() => {});
    conversationRef.current = null;
    widgetTokenRef.current = null;
    callIdRef.current = null;
    setGetLevels(() => null);
  }, []);

  const startCall = useCallback(async () => {
    setErrorMessage(null);
    setTranscript([]);
    setState('permission-prompt');

    // Step 1: prompt the OS mic dialog up-front so a denial fails cleanly
    // before we round-trip to the server. The SDK reopens its own stream
    // — we release this probe immediately.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch (e) {
      const denied =
        e instanceof DOMException &&
        (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      if (denied) {
        setState('permission-denied');
      } else {
        setErrorMessage(e instanceof Error ? e.message : 'Could not access your microphone.');
        setState('error');
      }
      return;
    }

    setState('connecting');

    // Step 2: bootstrap session — HMAC widget token gated on the agent
    // owner's domain allowlist and per-IP rate limit.
    let widgetToken: string;
    try {
      const res = await fetch('/api/widget/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentSlug: agent.slug }),
      });
      const body = (await res.json().catch(() => null)) as
        | { widgetToken?: string; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok || !body?.widgetToken) {
        setErrorMessage(messageForInitFailure(res.status, body?.error?.message));
        setState('error');
        void reportClientError({
          message: `widget/init ${res.status}: ${body?.error?.code ?? 'unknown'}`,
          name: 'VoiceInitError',
          context: { status: res.status, code: body?.error?.code },
        });
        return;
      }
      widgetToken = body.widgetToken;
      widgetTokenRef.current = widgetToken;
    } catch {
      setErrorMessage('Could not reach the server. Check your connection and try again.');
      setState('error');
      return;
    }

    // Step 3: exchange the token for a signed ElevenLabs WS URL + a
    // Call doc id we'll write transcript turns into.
    let signedUrl: string;
    let callId: string;
    try {
      const res = await fetch('/api/voice/signed-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ widgetToken }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            signedUrl?: string;
            callId?: string;
            error?: { code?: string; message?: string };
          }
        | null;
      if (!res.ok || !body?.signedUrl || !body?.callId) {
        setErrorMessage(messageForSignedUrlFailure(res.status, body?.error?.message));
        setState('error');
        void reportClientError({
          message: `voice/signed-url ${res.status}: ${body?.error?.code ?? 'unknown'}`,
          name: 'VoiceSignedUrlError',
          context: { status: res.status, code: body?.error?.code },
        });
        return;
      }
      signedUrl = body.signedUrl;
      callId = body.callId;
      callIdRef.current = callId;
    } catch {
      setErrorMessage('Could not reach the server. Check your connection and try again.');
      setState('error');
      return;
    }

    // Step 4: open the real ElevenLabs conversation. From here on the
    // SDK drives the state machine through its callbacks.
    try {
      const conversation = await Conversation.startSession({
        signedUrl,
        // Opt out of the SDK's screen Wake Lock. On some Chrome builds
        // it surfaces as the vague "Access other apps and services on
        // this device" permission prompt — confusing for callers, and
        // we don't need it for a short browser conversation.
        useWakeLock: false,
        onConnect: () => {
          setState('listening');
        },
        onDisconnect: (_details: DisconnectionDetails) => {
          fireEndCallBeacon();
          conversationRef.current = null;
          setGetLevels(() => null);
          setState('ended');
        },
        onError: (message: string, context?: unknown) => {
          setErrorMessage(message || 'The agent encountered an error.');
          setState('error');
          void reportClientError({
            message: `ElevenLabs SDK error: ${message}`,
            name: 'VoiceSDKError',
            context: { sdkContext: context ?? null },
          });
        },
        onModeChange: ({ mode }: { mode: Mode }) => {
          // SDK Mode is from the AGENT's POV: `speaking` = agent talks,
          // `listening` = agent listens (user can speak).
          setState(mode === 'speaking' ? 'speaking' : 'listening');
        },
        onMessage: ({ role, message }: SdkMessagePayload) => {
          if (!message) return;
          const local: TranscriptRole = role === 'user' ? 'user' : 'assistant';
          setTranscript((prev) => [...prev, { role: local, text: message, ts: Date.now() }]);
          persistTranscriptTurn(local, message);
          // Synthetic `thinking`: after the caller finishes a turn the
          // SDK keeps mode='listening' until the agent's first audio
          // frame. Show a thinking caption until the mode flip.
          if (local === 'user') {
            setState((s) => (s === 'listening' ? 'thinking' : s));
          }
        },
      });
      conversationRef.current = conversation;
      // Bind the listening waveform to the SDK's input analyser. The
      // wrapper-arrow trips React's "is this an updater function?" check
      // so the function itself lands in state.
      setGetLevels(() => () => conversation.getInputByteFrequencyData());
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not start the call.');
      setState('error');
      void reportClientError({
        message: `Conversation.startSession threw: ${e instanceof Error ? e.message : 'unknown'}`,
        name: 'VoiceSDKError',
      });
    }
  }, [agent.slug, fireEndCallBeacon, persistTranscriptTurn]);

  const endCall = useCallback(async () => {
    const conv = conversationRef.current;
    if (conv) {
      // endSession triggers onDisconnect, which sets state='ended' and
      // fires the end-call beacon. Don't double-fire from here.
      try {
        await conv.endSession();
      } catch {
        // Already disconnected — fall through to local cleanup.
        teardown();
        setState('ended');
      }
    } else {
      teardown();
      setState('idle');
    }
  }, [teardown]);

  const restart = useCallback(() => {
    teardown();
    setTranscript([]);
    setErrorMessage(null);
    setState('idle');
  }, [teardown]);

  return (
    // `min-h-0` lets the transcript child shrink inside the fixed-height
    // card; without it, the flex column grows past its parent and the
    // transcript's internal scroll never engages.
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative grid shrink-0 place-items-center">
        <TalkOrb state={state} onClick={startCall} getLevels={getLevels} />
      </div>

      <div className="shrink-0">
        <StateCaption
          state={state}
          errorMessage={errorMessage}
          onRetry={startCall}
          onRestart={restart}
        />
      </div>

      <Transcript transcript={transcript} ref={transcriptRef} state={state} agent={agent} />

      {ACTIVE_STATES.has(state) ? (
        <Button
          variant="outline"
          onClick={endCall}
          className="mx-auto shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <PhoneOff className="size-4" />
          End call
        </Button>
      ) : null}
    </div>
  );
}

// Friendly status-code copy. Server already returns publicMessage for AppErrors
// but we override for the most common cases so the UI reads cleanly even if
// the server message is missing.
function messageForInitFailure(status: number, serverMessage?: string): string {
  if (status === 401) return 'Embed not authorized for this domain.';
  if (status === 503) return 'This agent is temporarily unavailable.';
  if (status === 429) return 'Too many requests. Please wait a minute and try again.';
  if (status === 404) return 'Agent not found.';
  return serverMessage ?? 'Could not start the call.';
}

function messageForSignedUrlFailure(status: number, serverMessage?: string): string {
  if (status === 402) return 'Service limit reached. Please contact the site owner.';
  if (status === 401) return 'Widget session expired. Please reload the page.';
  if (status === 503) return 'This agent is temporarily unavailable.';
  return serverMessage ?? 'Could not start the call.';
}

// ---------------------------------------------------------------------------
// Talk orb — the main "tap to talk" affordance
// ---------------------------------------------------------------------------

function TalkOrb({
  state,
  onClick,
  getLevels,
}: {
  state: VoiceState;
  onClick: () => void;
  getLevels: (() => Uint8Array) | null;
}) {
  const interactive = state === 'idle';
  const showSpinner = state === 'permission-prompt' || state === 'connecting';
  const isListening = state === 'listening';
  const wave = state === 'speaking';

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-label={interactive ? 'Tap to talk' : 'Call in progress'}
      className={cn(
        'group relative grid size-44 place-items-center rounded-full transition disabled:cursor-default sm:size-52',
        interactive && 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
      )}
    >
      {/* Sonar rings — radiate outward continuously while the caller is talking. */}
      {isListening ? (
        <>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={`sonar-${i}`}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border border-voice/45"
              initial={{ scale: 0.94, opacity: 0.7 }}
              animate={{ scale: 1.55, opacity: 0 }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                delay: i * 0.7,
                ease: 'easeOut',
              }}
            />
          ))}
        </>
      ) : null}

      {/* Halo rings */}
      <motion.span
        aria-hidden
        className={cn(
          'absolute inset-0 rounded-full transition',
          isListening && 'bg-voice/15',
          state === 'thinking' && 'bg-voice/10',
          wave && 'bg-voice/15',
          state === 'error' && 'bg-destructive/10',
          state === 'permission-denied' && 'bg-destructive/10',
        )}
        animate={
          isListening
            ? { scale: [1, 1.06, 1], opacity: [0.6, 0.95, 0.6] }
            : { scale: 1, opacity: 1 }
        }
        transition={
          isListening
            ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }
        }
      />
      <span
        aria-hidden
        className={cn(
          'absolute inset-2 rounded-full transition',
          interactive && 'bg-voice/10 group-hover:bg-voice/15',
          isListening && 'bg-voice/25',
          wave && 'bg-voice/20',
          state === 'thinking' && 'bg-voice/15',
        )}
      />
      {/* Core */}
      <span
        className={cn(
          'relative grid size-32 place-items-center rounded-full shadow-[0_30px_60px_-20px_color-mix(in_oklch,var(--voice)_50%,transparent)] ring-1 ring-voice/30 transition sm:size-36',
          interactive && 'bg-voice text-voice-foreground',
          isListening && 'bg-voice text-voice-foreground ring-voice/60',
          wave && 'bg-voice text-voice-foreground',
          state === 'thinking' && 'bg-voice/90 text-voice-foreground',
          state === 'connecting' && 'bg-voice/80 text-voice-foreground',
          state === 'permission-prompt' && 'bg-muted text-muted-foreground ring-border/60',
          state === 'permission-denied' && 'bg-destructive/15 text-destructive ring-destructive/30',
          state === 'error' && 'bg-destructive/15 text-destructive ring-destructive/30',
          state === 'ended' && 'bg-muted text-muted-foreground ring-border/60',
        )}
      >
        <AnimatePresence mode="wait">
          {showSpinner ? (
            <motion.div
              key="spinner"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              <Loader2 className="size-9 animate-spin" />
            </motion.div>
          ) : isListening ? (
            <motion.div
              key="listening"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              <ListeningWaveform getLevels={getLevels} />
            </motion.div>
          ) : state === 'permission-denied' ? (
            <motion.div
              key="denied"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MicOff className="size-9" />
            </motion.div>
          ) : state === 'error' ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <AlertTriangle className="size-9" />
            </motion.div>
          ) : state === 'thinking' ? (
            <motion.div
              key="thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-end gap-1.5"
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block size-2.5 rounded-full bg-voice-foreground"
                  animate={{ y: [-2, 2, -2] }}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.15,
                  }}
                />
              ))}
            </motion.div>
          ) : state === 'speaking' ? (
            <motion.div
              key="speaking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1"
            >
              {[6, 12, 18, 14, 8].map((h, i) => (
                <motion.span
                  key={i}
                  className="block w-1.5 rounded-full bg-voice-foreground"
                  animate={{ height: [`${h * 0.5}px`, `${h * 1.6}px`, `${h * 0.5}px`] }}
                  transition={{
                    duration: 0.7,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.07,
                  }}
                />
              ))}
            </motion.div>
          ) : state === 'ended' ? (
            <motion.div
              key="ended"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <PhoneOff className="size-9" />
            </motion.div>
          ) : (
            <motion.div
              key="mic"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              <Mic className="size-9" />
            </motion.div>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Listening waveform — driven by SDK's input analyser
// ---------------------------------------------------------------------------

const BASE_PEAKS = [14, 22, 30, 38, 44, 38, 30, 22, 14] as const;
const LISTENING_PEAKS = BASE_PEAKS.map((v) => v * 1.8);
const FLOOR_RATIO = 0.1;

function ListeningWaveform({ getLevels }: { getLevels: (() => Uint8Array) | null }) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const bars = barRefs.current.filter((b): b is HTMLSpanElement => !!b);
    if (bars.length === 0) return;

    let raf = 0;
    let cancelled = false;
    // Per-bar smoothed level so bars decay gently when you go silent
    // rather than snapping to floor on a single quiet frame.
    const smoothed = new Array<number>(bars.length).fill(0);

    const start = performance.now();
    const tick = (now: number) => {
      if (cancelled) return;

      let buffer: Uint8Array | null = null;
      if (getLevels) {
        try {
          const b = getLevels();
          if (b && b.length > 0) buffer = b;
        } catch {
          buffer = null;
        }
      }

      if (buffer) {
        // Down-sample buffer to bar count by averaging neighbour bins.
        const binSize = buffer.length / bars.length;
        for (let i = 0; i < bars.length; i++) {
          const lo = Math.floor(i * binSize);
          const hi = Math.floor((i + 1) * binSize);
          let sum = 0;
          for (let j = lo; j < hi; j++) sum += buffer[j];
          const raw = sum / Math.max(1, hi - lo) / 255;
          // Faster rise than fall — snappy on speech, graceful on silence.
          const target = Math.min(1, raw * 1.6);
          const speed = target > smoothed[i] ? 0.45 : 0.12;
          smoothed[i] = smoothed[i] + (target - smoothed[i]) * speed;
        }
      } else {
        // Subtle shimmer while we wait for the SDK to attach (or when
        // an upstream caller renders this without providing levels).
        const t = (now - start) / 1000;
        for (let i = 0; i < bars.length; i++) {
          const v = (Math.sin(t * 1.6 + i * 0.45) + 1) / 2;
          smoothed[i] = 0.06 + v * 0.18;
        }
      }

      for (let i = 0; i < bars.length; i++) {
        const peak = LISTENING_PEAKS[i];
        const floor = peak * FLOOR_RATIO;
        const h = floor + smoothed[i] * (peak - floor);
        bars[i].style.height = `${Math.round(h)}px`;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [getLevels]);

  return (
    <div className="flex items-center gap-1.25" aria-hidden>
      {LISTENING_PEAKS.map((peak, i) => (
        <span
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className="block w-1.5 rounded-full bg-voice-foreground"
          style={{ height: `${Math.round(peak * FLOOR_RATIO)}px` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Caption — status text + recovery actions under the orb
// ---------------------------------------------------------------------------

function StateCaption({
  state,
  errorMessage,
  onRetry,
  onRestart,
}: {
  state: VoiceState;
  errorMessage: string | null;
  onRetry: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="min-h-22 text-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="space-y-2"
        >
          {state === 'idle' ? (
            <>
              <p className="font-serif text-xl tracking-tight">Tap to talk</p>
              <p className="text-xs text-muted-foreground">Your mic stays off until you tap.</p>
            </>
          ) : state === 'permission-prompt' ? (
            <>
              <p className="font-serif text-xl tracking-tight">Waiting for permission…</p>
              <p className="text-xs text-muted-foreground">
                Allow microphone access in the browser prompt to continue.
              </p>
            </>
          ) : state === 'connecting' ? (
            <>
              <p className="font-serif text-xl tracking-tight">Connecting…</p>
              <p className="text-xs text-muted-foreground">Securing the call.</p>
            </>
          ) : state === 'listening' ? (
            <>
              <p className="font-serif text-xl tracking-tight">Listening…</p>
              <p className="text-xs text-muted-foreground">Speak naturally — I&apos;ll respond when you pause.</p>
            </>
          ) : state === 'thinking' ? (
            <>
              <p className="font-serif text-xl tracking-tight">Thinking…</p>
              <p className="text-xs text-muted-foreground">Pulling the right answer.</p>
            </>
          ) : state === 'speaking' ? (
            <>
              <p className="font-serif text-xl tracking-tight">Speaking…</p>
              <p className="text-xs text-muted-foreground">Tap End call any time to interrupt.</p>
            </>
          ) : state === 'ended' ? (
            <>
              <p className="font-serif text-xl tracking-tight">Call ended</p>
              <Button onClick={onRestart} size="sm" className="mt-2">
                <Play className="size-4" />
                Start new call
              </Button>
            </>
          ) : state === 'permission-denied' ? (
            <PermissionDeniedHelp onRetry={onRetry} />
          ) : state === 'error' ? (
            <>
              <p className="font-serif text-xl tracking-tight text-destructive">
                Something went wrong
              </p>
              <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                {errorMessage ?? 'The call could not start. Please try again.'}
              </p>
              <Button onClick={onRetry} size="sm" variant="outline" className="mt-2">
                <RefreshCcw className="size-4" />
                Try again
              </Button>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function PermissionDeniedHelp({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-sm space-y-2 text-left">
      <p className="text-center font-serif text-xl tracking-tight text-destructive">
        Microphone blocked
      </p>
      <p className="text-center text-xs text-muted-foreground">
        We can&apos;t hear you without microphone access. Re-enable it in your browser:
      </p>
      <ol className="space-y-1 rounded-xl border border-border/70 bg-card/50 p-3 text-xs text-muted-foreground">
        <li className="flex gap-2">
          <Settings2 className="mt-0.5 size-3.5 shrink-0 text-voice" />
          Click the lock icon in your address bar.
        </li>
        <li className="flex gap-2">
          <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-voice" />
          Set <span className="font-medium text-foreground">Microphone</span> to{' '}
          <span className="font-medium text-foreground">Allow</span>.
        </li>
        <li className="flex gap-2">
          <RefreshCcw className="mt-0.5 size-3.5 shrink-0 text-voice" />
          Reload this page or tap try again below.
        </li>
      </ol>
      <div className="flex justify-center pt-1">
        <Button onClick={onRetry} size="sm">
          <RefreshCcw className="size-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

function Transcript({
  transcript,
  state,
  agent,
  ref,
}: {
  transcript: TranscriptEntry[];
  state: VoiceState;
  agent: TalkAgent;
  ref: React.RefObject<HTMLDivElement | null>;
}) {
  const showCallEndedSummary = state === 'ended';

  if (transcript.length === 0 && state === 'idle') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
        <div>
          <Sparkles className="mx-auto mb-2 size-4 text-voice" aria-hidden />
          Transcript will appear here once the call starts.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        ref={ref}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border/60 bg-card/40 px-4 py-4"
      >
        {transcript.map((entry, i) => (
          <Bubble key={i} entry={entry} />
        ))}
        {state === 'thinking' ? <TypingBubble /> : null}
      </div>
      {showCallEndedSummary ? (
        <div className="shrink-0 rounded-xl border border-voice/30 bg-voice/5 px-4 py-3 text-xs leading-relaxed text-foreground">
          <p className="font-medium">Call summary</p>
          <p className="text-muted-foreground">
            {transcript.length} message{transcript.length === 1 ? '' : 's'} with{' '}
            <span className="font-medium text-foreground">{agent.name}</span>.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Bubble({ entry }: { entry: TranscriptEntry }) {
  const time = useMemo(() => formatTime(entry.ts), [entry.ts]);
  if (entry.role === 'user') {
    return (
      <div className="flex justify-end" title={time}>
        <p className="max-w-[80%] rounded-2xl rounded-tr-md bg-voice/15 px-3 py-2 text-sm leading-relaxed text-foreground">
          {entry.text}
        </p>
      </div>
    );
  }
  return (
    <div className="flex justify-start" title={time}>
      <p className="max-w-[90%] text-sm leading-relaxed text-foreground">{entry.text}</p>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl bg-muted/60 px-3 py-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block size-1.5 rounded-full bg-muted-foreground"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
