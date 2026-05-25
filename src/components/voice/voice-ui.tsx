'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

const ACTIVE_STATES = new Set<VoiceState>(['listening', 'thinking', 'speaking']);

// Phase-9 fakery — populated for visual testing. Removed when Phase 10
// wires the live ElevenLabs SDK into this component.
const DEMO_TRANSCRIPT: TranscriptEntry[] = [
  { role: 'assistant', text: "Hi! How can I help you today?", ts: Date.now() - 22_000 },
  { role: 'user', text: 'Do you have any appointments this Friday?', ts: Date.now() - 14_000 },
  {
    role: 'assistant',
    text: "Let me check. We have openings at 10:30 AM and 2:15 PM on Friday — would either of those work?",
    ts: Date.now() - 7_000,
  },
];

const CYCLE_ORDER: VoiceState[] = [
  'idle',
  'permission-prompt',
  'permission-denied',
  'connecting',
  'listening',
  'thinking',
  'speaking',
  'ended',
  'error',
];

// ---------------------------------------------------------------------------
// VoiceUI
// ---------------------------------------------------------------------------

export function VoiceUI({ agent }: { agent: TalkAgent }) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const stopStream = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  // Hard-stop the mic if the component unmounts mid-call (route change,
  // refresh, etc.) — leaving a track running shows a permanent "this site
  // is using your microphone" indicator and tanks the user's trust.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      stream?.getTracks().forEach((t) => t.stop());
    };
    // We deliberately omit `stream` from deps — this effect models *unmount*,
    // not every stream swap (which already cleans up via stopStream).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll the transcript when a new entry lands.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [transcript.length, state]);

  // Phase-9 visual demo: when we enter `speaking`, seed a few transcript
  // lines so the UI has something to render. Phase 10 deletes this and
  // pushes real lines from the ElevenLabs SDK callbacks.
  useEffect(() => {
    if (state === 'speaking' && transcript.length === 0) {
      setTranscript(DEMO_TRANSCRIPT);
    }
    if (state === 'idle' || state === 'ended') {
      // Keep transcript visible after a call ends; clear only on a fresh start.
    }
  }, [state, transcript.length]);

  const startCall = useCallback(async () => {
    setErrorMessage(null);
    setState('permission-prompt');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Hold the stream so ListeningWaveform can wire an AnalyserNode and
      // drive the bars from real audio levels. Phase 10's SDK will take
      // over the stream lifecycle — we'll hand the granted stream in
      // rather than letting the SDK request a new one.
      setStream(s);
      setState('connecting');
      // Brief Phase-9 handshake delay so the connect→listen handoff doesn't
      // feel instantaneous. Phase 10 transitions from the SDK's on-open.
      window.setTimeout(() => setState('listening'), 700);
    } catch (e) {
      const denied =
        e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      if (denied) {
        setState('permission-denied');
      } else {
        setErrorMessage(e instanceof Error ? e.message : 'Could not access your microphone.');
        setState('error');
      }
    }
  }, []);

  const endCall = useCallback(() => {
    stopStream();
    setState('idle');
  }, [stopStream]);

  const restart = useCallback(() => {
    stopStream();
    setTranscript([]);
    setErrorMessage(null);
    setState('idle');
  }, [stopStream]);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="relative grid place-items-center">
        <TalkOrb state={state} onClick={startCall} stream={stream} />
      </div>

      <StateCaption state={state} errorMessage={errorMessage} onRetry={startCall} onRestart={restart} />

      <Transcript transcript={transcript} ref={transcriptRef} state={state} agent={agent} />

      {ACTIVE_STATES.has(state) ? (
        <Button
          variant="outline"
          onClick={endCall}
          className="mx-auto border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <PhoneOff className="size-4" />
          End call
        </Button>
      ) : null}

      <DevCycler state={state} setState={setState} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Talk orb — the main "tap to talk" affordance
// ---------------------------------------------------------------------------

function TalkOrb({
  state,
  onClick,
  stream,
}: {
  state: VoiceState;
  onClick: () => void;
  stream: MediaStream | null;
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
              <ListeningWaveform stream={stream} />
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
// Listening waveform — the centerpiece of "user is talking"
// ---------------------------------------------------------------------------

// Peak heights are tuned so the wave sits within the 36px-tall core circle
// with a comfortable margin. Edges shorter, middle taller — the classic
// "voice signal" silhouette. When a real MediaStream is provided the bars
// drive off an AnalyserNode; with no stream (dev cycler), they fall back
// to a faint idle shimmer so the orb still looks alive.
const LISTENING_PEAKS = [14, 22, 30, 38, 44, 38, 30, 22, 14] as const;
const FLOOR_RATIO = 0.18;

function ListeningWaveform({ stream }: { stream: MediaStream | null }) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const bars = barRefs.current.filter((b): b is HTMLSpanElement => !!b);
    if (bars.length === 0) return;

    let raf = 0;
    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    // ArrayBuffer-backed (not SharedArrayBuffer) so AnalyserNode.getByteFrequencyData accepts it.
    let buffer: Uint8Array<ArrayBuffer> | null = null;
    // Per-bar smoothed level so the bars decay gently when you go silent
    // rather than snapping to floor on a single quiet frame.
    const smoothed = new Array<number>(bars.length).fill(0);

    if (stream && stream.getAudioTracks().length > 0) {
      try {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AC) {
          audioCtx = new AC();
          // AudioContext can spawn suspended on some browsers; resume is
          // a no-op when it's already running. Promise-rejection swallowed
          // because Safari has historically rejected silently.
          audioCtx.resume().catch(() => {});
          const source = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64; // 32 frequency bins — plenty for 9 bars
          analyser.smoothingTimeConstant = 0.65;
          source.connect(analyser);
          buffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        }
      } catch {
        analyser = null;
      }
    }

    const start = performance.now();
    const tick = (now: number) => {
      if (cancelled) return;

      if (analyser && buffer) {
        analyser.getByteFrequencyData(buffer);
        // Down-sample buffer to bar count by averaging neighbour bins.
        const binSize = buffer.length / bars.length;
        for (let i = 0; i < bars.length; i++) {
          const lo = Math.floor(i * binSize);
          const hi = Math.floor((i + 1) * binSize);
          let sum = 0;
          for (let j = lo; j < hi; j++) sum += buffer[j];
          const raw = sum / Math.max(1, hi - lo) / 255; // 0..1
          // Exponential smoothing toward the new level — faster rise
          // (snappy when you speak) than fall (graceful decay).
          const target = Math.min(1, raw * 1.6);
          const speed = target > smoothed[i] ? 0.45 : 0.12;
          smoothed[i] = smoothed[i] + (target - smoothed[i]) * speed;
        }
      } else {
        // No mic stream — fall back to a low-amplitude idle shimmer so
        // the dev cycler still has something to look at.
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
      audioCtx?.close().catch(() => {});
    };
  }, [stream]);

  return (
    <div className="flex items-center gap-1.25" aria-hidden>
      {LISTENING_PEAKS.map((peak, i) => (
        <span
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className="block w-1.5 rounded-full bg-voice-foreground transition-[background-color]"
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
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
        <Sparkles className="mx-auto mb-2 size-4 text-voice" aria-hidden />
        Transcript will appear here once the call starts.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={ref}
        className="max-h-72 space-y-3 overflow-y-auto rounded-2xl border border-border/60 bg-card/40 px-4 py-4"
      >
        {transcript.map((entry, i) => (
          <Bubble key={i} entry={entry} />
        ))}
        {state === 'thinking' ? <TypingBubble /> : null}
      </div>
      {showCallEndedSummary ? (
        <div className="rounded-xl border border-voice/30 bg-voice/5 px-4 py-3 text-xs leading-relaxed text-foreground">
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

// ---------------------------------------------------------------------------
// Dev-only state cycler
// ---------------------------------------------------------------------------

function DevCycler({
  state,
  setState,
}: {
  state: VoiceState;
  setState: (s: VoiceState) => void;
}) {
  if (process.env.NODE_ENV !== 'development') return null;
  const idx = CYCLE_ORDER.indexOf(state);
  const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
  return (
    <div className="mx-auto flex flex-col items-center gap-1.5 pt-2">
      <button
        type="button"
        onClick={() => setState(next)}
        className="rounded-full border border-dashed border-border/70 bg-card/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
      >
        Dev: cycle state ({state} → {next})
      </button>
    </div>
  );
}
