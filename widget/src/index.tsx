/** @jsxImportSource preact */
import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Conversation, type DisconnectionDetails, type Mode } from '@elevenlabs/client';
import { CSS } from './styles';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
//
// The customer drops a single <script src=".../widget.js" data-agent-slug="...">
// tag onto their page. On load this entry:
//   1. Resolves which script tag actually carries the data-agent-slug
//      (`document.currentScript` is null for async/defer scripts).
//   2. Reads optional positioning/colour overrides.
//   3. Derives the API origin from the script src — that's where /api/widget
//      and /api/voice live.
//   4. Mounts the widget inside a Shadow DOM so the host page's CSS can't
//      collide with ours and vice-versa.
// ---------------------------------------------------------------------------

type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

function getScriptTag(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) return document.currentScript;
  // Async / defer / type=module scripts have currentScript === null. Fall
  // back to scanning for any <script src*="widget.js"> with the slug attr.
  const all = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="widget.js"]'));
  return all.find((s) => s.dataset.agentSlug) ?? all[0] ?? null;
}

function getApiBase(scriptTag: HTMLScriptElement | null): string {
  const src = scriptTag?.src;
  if (src) {
    try {
      return new URL(src).origin;
    } catch {
      // fallthrough
    }
  }
  return window.location.origin;
}

function bootstrap(): void {
  const tag = getScriptTag();
  const slug = tag?.dataset.agentSlug?.trim();
  if (!slug) {
    // Loud but non-fatal — customer can fix by adding data-agent-slug.
    // eslint-disable-next-line no-console
    console.warn(
      '[VoiceFlow widget] missing data-agent-slug on the <script> tag. Widget not mounted.',
    );
    return;
  }

  const position = (tag?.dataset.position ?? 'bottom-right') as Position;
  const primary = tag?.dataset.colorPrimary || '';
  const apiBase = getApiBase(tag);

  const host = document.createElement('div');
  host.id = 'voiceflow-widget-host';
  // The host stays in the DOM root with zero size; the modal/button
  // positions itself via the shadow tree using `position: fixed`.
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  shadow.appendChild(styleEl);

  const root = document.createElement('div');
  root.className = 'vf-root';
  if (primary) root.style.setProperty('--vf-primary', primary);
  shadow.appendChild(root);

  render(<Widget slug={slug} apiBase={apiBase} position={position} />, root);
}

// NOTE: bootstrap is registered at the BOTTOM of this file, AFTER every
// module-scope `const` is initialised. esbuild's IIFE wrap hoists const
// declarations to `var` (no TDZ), so calling bootstrap up here would see
// `POSITION_CLASS` and `ACTIVE` as undefined and crash on first render.

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

type VoiceState =
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
type SdkMessagePayload = { message: string; role?: 'user' | 'agent' };
type ConversationInstance = Awaited<ReturnType<typeof Conversation.startSession>>;

const ACTIVE = new Set<VoiceState>(['listening', 'thinking', 'speaking']);
const POSITION_CLASS: Record<Position, string> = {
  'bottom-right': 'vf-pos-br',
  'bottom-left': 'vf-pos-bl',
  'top-right': 'vf-pos-tr',
  'top-left': 'vf-pos-tl',
};

function Widget({
  slug,
  apiBase,
  position,
}: {
  slug: string;
  apiBase: string;
  position: Position;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [getLevels, setGetLevels] = useState<(() => Uint8Array) | null>(null);

  const conversationRef = useRef<ConversationInstance | null>(null);
  const tokenRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      conversationRef.current?.endSession().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript.length, state]);

  const persistTurn = useCallback(
    (role: TranscriptRole, content: string) => {
      const tok = tokenRef.current;
      const cid = callIdRef.current;
      if (!tok || !cid) return;
      void fetch(`${apiBase}/api/widget/transcript`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ widgetToken: tok, callId: cid, role, content }),
        keepalive: true,
      }).catch(() => {});
    },
    [apiBase],
  );

  const fireEndCallBeacon = useCallback(() => {
    const tok = tokenRef.current;
    const cid = callIdRef.current;
    if (!tok || !cid) return;
    void fetch(`${apiBase}/api/widget/end-call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ widgetToken: tok, callId: cid }),
      keepalive: true,
    }).catch(() => {});
  }, [apiBase]);

  const teardown = useCallback(() => {
    conversationRef.current?.endSession().catch(() => {});
    conversationRef.current = null;
    tokenRef.current = null;
    callIdRef.current = null;
    setGetLevels(() => null);
  }, []);

  const startCall = useCallback(async () => {
    setErrorMessage(null);
    setTranscript([]);
    setState('permission-prompt');

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

    let widgetToken: string;
    try {
      const res = await fetch(`${apiBase}/api/widget/init`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentSlug: slug }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            widgetToken?: string;
            agentName?: string;
            businessName?: string;
            error?: { code?: string; message?: string };
          }
        | null;
      if (!res.ok || !body?.widgetToken) {
        setErrorMessage(
          res.status === 401
            ? 'Embed not authorized for this domain.'
            : res.status === 503
            ? 'This agent is temporarily unavailable.'
            : res.status === 429
            ? 'Too many requests. Please wait a minute and try again.'
            : body?.error?.message ?? 'Could not start the call.',
        );
        setState('error');
        return;
      }
      widgetToken = body.widgetToken;
      tokenRef.current = widgetToken;
      if (body.agentName) setAgentName(body.agentName);
      if (body.businessName) setBusinessName(body.businessName);
    } catch {
      setErrorMessage('Could not reach the server. Check your connection and try again.');
      setState('error');
      return;
    }

    let signedUrl: string;
    let callId: string;
    try {
      const res = await fetch(`${apiBase}/api/voice/signed-url`, {
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
        setErrorMessage(
          res.status === 402
            ? 'Service limit reached. Please contact the site owner.'
            : res.status === 503
            ? 'This agent is temporarily unavailable.'
            : body?.error?.message ?? 'Could not start the call.',
        );
        setState('error');
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

    try {
      const conversation = await Conversation.startSession({
        signedUrl,
        onConnect: () => setState('listening'),
        onDisconnect: (_d: DisconnectionDetails) => {
          fireEndCallBeacon();
          conversationRef.current = null;
          setGetLevels(() => null);
          setState('ended');
        },
        onError: (message: string) => {
          setErrorMessage(message || 'The agent encountered an error.');
          setState('error');
        },
        onModeChange: ({ mode }: { mode: Mode }) =>
          setState(mode === 'speaking' ? 'speaking' : 'listening'),
        onMessage: ({ role, message }: SdkMessagePayload) => {
          if (!message) return;
          const local: TranscriptRole = role === 'user' ? 'user' : 'assistant';
          setTranscript((prev) => [...prev, { role: local, text: message, ts: Date.now() }]);
          persistTurn(local, message);
          if (local === 'user') setState((s) => (s === 'listening' ? 'thinking' : s));
        },
      });
      conversationRef.current = conversation;
      setGetLevels(() => () => conversation.getInputByteFrequencyData());
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not start the call.');
      setState('error');
    }
  }, [apiBase, slug, fireEndCallBeacon, persistTurn]);

  const endCall = useCallback(async () => {
    const conv = conversationRef.current;
    if (conv) {
      try {
        await conv.endSession();
      } catch {
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

  function close() {
    if (ACTIVE.has(state)) {
      void endCall();
    }
    setOpen(false);
  }

  return (
    <div class={`vf-stack ${POSITION_CLASS[position]}`}>
      {open ? (
        <div class="vf-modal" role="dialog" aria-label={`Talk to ${agentName || 'agent'}`}>
          <header class="vf-modal-header">
            <div class="vf-header-text">
              {businessName ? <p class="vf-eyebrow">{businessName}</p> : null}
              <p class="vf-title">{agentName || 'Talk'}</p>
            </div>
            <button
              type="button"
              class="vf-close"
              onClick={close}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div class="vf-body">
            <TalkOrb state={state} onClick={startCall} getLevels={getLevels} />
            <Caption
              state={state}
              errorMessage={errorMessage}
              onRetry={startCall}
              onRestart={restart}
            />
            <Transcript transcript={transcript} scrollRef={transcriptScrollRef} state={state} />

            {ACTIVE.has(state) ? (
              <button type="button" class="vf-end-call" onClick={endCall}>
                End call
              </button>
            ) : null}
          </div>

          <footer class="vf-footer">Powered by VoiceFlow</footer>
        </div>
      ) : null}

      <button
        type="button"
        class="vf-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close voice agent' : 'Talk to voice agent'}
      >
        <MicGlyph />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Talk orb
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
  const isSpeaking = state === 'speaking';
  const isThinking = state === 'thinking';
  const isError = state === 'error' || state === 'permission-denied';

  return (
    <button
      type="button"
      class={`vf-orb ${interactive ? 'vf-interactive' : ''} ${
        isListening ? 'vf-listening' : ''
      } ${isError ? 'vf-error' : ''}`}
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-label={interactive ? 'Tap to talk' : 'Call in progress'}
    >
      {isListening ? (
        <>
          <span class="vf-sonar vf-sonar-0" aria-hidden />
          <span class="vf-sonar vf-sonar-1" aria-hidden />
          <span class="vf-sonar vf-sonar-2" aria-hidden />
        </>
      ) : null}
      <span class="vf-orb-core">
        {showSpinner ? (
          <span class="vf-spinner" aria-hidden />
        ) : isListening ? (
          <ListeningBars getLevels={getLevels} />
        ) : isThinking ? (
          <ThinkingDots />
        ) : isSpeaking ? (
          <SpeakingBars />
        ) : state === 'ended' ? (
          <PhoneOffGlyph />
        ) : isError ? (
          // Covers both 'error' and 'permission-denied' — see `isError`.
          <span class="vf-glyph vf-glyph-warn">!</span>
        ) : (
          <MicGlyph />
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Caption
// ---------------------------------------------------------------------------

function Caption({
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
    <div class="vf-caption">
      {state === 'idle' && (
        <>
          <p class="vf-cap-title">Tap to talk</p>
          <p class="vf-cap-sub">Your mic stays off until you tap.</p>
        </>
      )}
      {state === 'permission-prompt' && (
        <>
          <p class="vf-cap-title">Waiting for permission…</p>
          <p class="vf-cap-sub">Allow microphone access in the browser prompt.</p>
        </>
      )}
      {state === 'connecting' && (
        <>
          <p class="vf-cap-title">Connecting…</p>
          <p class="vf-cap-sub">Securing the call.</p>
        </>
      )}
      {state === 'listening' && (
        <>
          <p class="vf-cap-title">Listening…</p>
          <p class="vf-cap-sub">Speak naturally — I&apos;ll respond when you pause.</p>
        </>
      )}
      {state === 'thinking' && (
        <>
          <p class="vf-cap-title">Thinking…</p>
        </>
      )}
      {state === 'speaking' && (
        <>
          <p class="vf-cap-title">Speaking…</p>
          <p class="vf-cap-sub">Tap End call to interrupt.</p>
        </>
      )}
      {state === 'ended' && (
        <>
          <p class="vf-cap-title">Call ended</p>
          <button type="button" class="vf-btn" onClick={onRestart}>
            Start new call
          </button>
        </>
      )}
      {state === 'permission-denied' && (
        <>
          <p class="vf-cap-title vf-text-warn">Microphone blocked</p>
          <p class="vf-cap-sub">
            Allow microphone access in your browser settings, then tap below.
          </p>
          <button type="button" class="vf-btn" onClick={onRetry}>
            Try again
          </button>
        </>
      )}
      {state === 'error' && (
        <>
          <p class="vf-cap-title vf-text-warn">Something went wrong</p>
          <p class="vf-cap-sub">{errorMessage ?? 'Please try again.'}</p>
          <button type="button" class="vf-btn vf-btn-secondary" onClick={onRetry}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

function Transcript({
  transcript,
  state,
  scrollRef,
}: {
  transcript: TranscriptEntry[];
  state: VoiceState;
  // Named `scrollRef` rather than `ref` so Preact doesn't intercept it as
  // a special component-ref attribute — it would then be `undefined` in
  // our destructuring and the callback would explode on `.current = el`.
  scrollRef: { current: HTMLDivElement | null };
}) {
  if (transcript.length === 0 && state === 'idle') return null;
  return (
    <div class="vf-transcript-wrap">
      <div
        class="vf-transcript"
        ref={(el) => {
          scrollRef.current = el;
        }}
      >
        {transcript.map((entry, i) => (
          <div key={i} class={`vf-bubble vf-bubble-${entry.role}`}>
            {entry.text}
          </div>
        ))}
        {state === 'thinking' ? (
          <div class="vf-typing">
            <span /> <span /> <span />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visualizers
// ---------------------------------------------------------------------------

const BASE_PEAKS = [12, 18, 24, 30, 36, 30, 24, 18, 12];
const FLOOR_RATIO = 0.18;

function ListeningBars({ getLevels }: { getLevels: (() => Uint8Array) | null }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const smoothed = new Array<number>(BASE_PEAKS.length).fill(0);
    const startedAt = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;
      const bars = refs.current.filter((b): b is HTMLSpanElement => !!b);
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
        const binSize = buffer.length / bars.length;
        for (let i = 0; i < bars.length; i++) {
          const lo = Math.floor(i * binSize);
          const hi = Math.floor((i + 1) * binSize);
          let sum = 0;
          for (let j = lo; j < hi; j++) sum += buffer[j];
          const raw = sum / Math.max(1, hi - lo) / 255;
          const target = Math.min(1, raw * 1.6);
          const speed = target > smoothed[i] ? 0.45 : 0.12;
          smoothed[i] = smoothed[i] + (target - smoothed[i]) * speed;
        }
      } else {
        const t = (now - startedAt) / 1000;
        for (let i = 0; i < bars.length; i++) {
          const v = (Math.sin(t * 1.6 + i * 0.45) + 1) / 2;
          smoothed[i] = 0.06 + v * 0.18;
        }
      }

      for (let i = 0; i < bars.length; i++) {
        const peak = BASE_PEAKS[i];
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
    <div class="vf-bars vf-bars-listen" aria-hidden>
      {BASE_PEAKS.map((peak, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          style={{ height: `${Math.round(peak * FLOOR_RATIO)}px` }}
        />
      ))}
    </div>
  );
}

function SpeakingBars() {
  return (
    <div class="vf-bars vf-bars-speak" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={`animation-delay:${i * 0.08}s`} />
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div class="vf-dots" aria-hidden>
      <span /> <span /> <span />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glyphs — inline SVG keeps the bundle dependency-free
// ---------------------------------------------------------------------------

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" class="vf-svg" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2Z"
      />
    </svg>
  );
}

function PhoneOffGlyph() {
  return (
    <svg viewBox="0 0 24 24" class="vf-svg" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M21 15.46l-5.27-.61-2.52 2.52a15.05 15.05 0 0 1-6.59-6.59l2.52-2.52L8.54 3H3.03a17.97 17.97 0 0 0 17.97 17.97V15.46Z"
      />
      <path
        fill="currentColor"
        d="m2.1 3.51 1.41-1.41 18.39 18.4-1.42 1.41z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Boot — kept at the end of the file so every module-scope `const`
// (POSITION_CLASS, ACTIVE, BASE_PEAKS, FLOOR_RATIO) is initialised before
// the first synchronous render. See the note near `bootstrap()` above.
// ---------------------------------------------------------------------------

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}

