// Shipped inline inside the Shadow DOM. Variables let the host site
// override the primary accent via `data-color-primary` on the script tag.
export const CSS = /* css */ `
:host, .vf-root {
  --vf-primary: #d97706;
  --vf-primary-foreground: #1a1208;
  --vf-bg: #ffffff;
  --vf-fg: #14110b;
  --vf-muted: #f4f1ec;
  --vf-muted-fg: #6b6055;
  --vf-border: rgba(20, 17, 11, 0.08);
  --vf-warn: #b45309;
  --vf-warn-bg: rgba(180, 83, 9, 0.08);
  --vf-radius: 16px;
  --vf-shadow: 0 24px 60px -20px rgba(20, 17, 11, 0.35);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--vf-fg);
  font-size: 14px;
  line-height: 1.4;
}

@media (prefers-color-scheme: dark) {
  :host, .vf-root {
    --vf-bg: #1a1611;
    --vf-fg: #f5f1ea;
    --vf-muted: #25201a;
    --vf-muted-fg: #a09684;
    --vf-border: rgba(255, 255, 255, 0.08);
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: transparent; }

.vf-stack {
  position: fixed;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  pointer-events: none;
}
.vf-stack > * { pointer-events: auto; }
.vf-pos-br { right: 16px; bottom: 16px; }
.vf-pos-bl { left: 16px; bottom: 16px; align-items: flex-start; }
.vf-pos-tr { right: 16px; top: 16px; }
.vf-pos-tl { left: 16px; top: 16px; align-items: flex-start; }

/* Floating action button */
.vf-fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--vf-primary);
  color: var(--vf-primary-foreground);
  box-shadow: 0 12px 32px -8px rgba(217, 119, 6, 0.55);
  display: grid;
  place-items: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.vf-fab:hover { transform: translateY(-2px); box-shadow: 0 18px 40px -8px rgba(217, 119, 6, 0.65); }
.vf-fab:active { transform: translateY(0); }
.vf-fab .vf-svg { width: 26px; height: 26px; }

/* Modal */
.vf-modal {
  width: 360px;
  max-width: calc(100vw - 32px);
  max-height: min(640px, calc(100vh - 100px));
  display: flex;
  flex-direction: column;
  background: var(--vf-bg);
  border: 1px solid var(--vf-border);
  border-radius: var(--vf-radius);
  box-shadow: var(--vf-shadow);
  overflow: hidden;
  animation: vf-pop 0.18s ease-out;
}
@keyframes vf-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.vf-modal-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--vf-border);
}
.vf-header-text { flex: 1; }
.vf-eyebrow {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vf-primary);
}
.vf-title {
  margin-top: 2px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.vf-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 20px;
  line-height: 1;
  color: var(--vf-muted-fg);
  transition: background 0.15s ease, color 0.15s ease;
}
.vf-close:hover { background: var(--vf-muted); color: var(--vf-fg); }

.vf-body {
  padding: 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  flex: 1;
  overflow-y: auto;
}

.vf-footer {
  padding: 8px 16px 12px;
  font-size: 10px;
  text-align: center;
  color: var(--vf-muted-fg);
  border-top: 1px solid var(--vf-border);
}

/* Orb */
.vf-orb {
  position: relative;
  width: 132px;
  height: 132px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: transform 0.18s ease;
}
.vf-interactive:hover { transform: scale(1.03); }
.vf-interactive:active { transform: scale(0.97); }
.vf-orb-core {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--vf-primary);
  color: var(--vf-primary-foreground);
  display: grid;
  place-items: center;
  box-shadow: 0 24px 48px -16px rgba(217, 119, 6, 0.5);
  transition: background 0.2s ease;
}
.vf-error .vf-orb-core { background: var(--vf-warn-bg); color: var(--vf-warn); box-shadow: none; }

.vf-orb-core .vf-svg { width: 32px; height: 32px; }
.vf-glyph { font-size: 28px; font-weight: 700; }
.vf-glyph-warn { color: var(--vf-warn); }

.vf-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid currentColor;
  border-top-color: transparent;
  animation: vf-spin 0.8s linear infinite;
}
@keyframes vf-spin { to { transform: rotate(360deg); } }

/* Sonar rings around the orb during listening */
.vf-sonar {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid color-mix(in oklch, var(--vf-primary) 50%, transparent);
  animation: vf-sonar 2.2s ease-out infinite;
  pointer-events: none;
}
.vf-sonar-1 { animation-delay: 0.7s; }
.vf-sonar-2 { animation-delay: 1.4s; }
@keyframes vf-sonar {
  0% { transform: scale(0.94); opacity: 0.7; }
  100% { transform: scale(1.55); opacity: 0; }
}

/* Listening waveform bars (heights driven imperatively by JS) */
.vf-bars { display: flex; align-items: center; gap: 4px; }
.vf-bars-listen span { width: 5px; border-radius: 999px; background: currentColor; transition: height 0.05s linear; }
.vf-bars-speak span {
  width: 5px;
  border-radius: 999px;
  background: currentColor;
  animation: vf-speak 0.8s ease-in-out infinite;
  height: 16px;
}
@keyframes vf-speak {
  0%, 100% { height: 10px; }
  50% { height: 30px; }
}

.vf-dots { display: flex; gap: 6px; align-items: flex-end; }
.vf-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: vf-dot 0.9s ease-in-out infinite;
}
.vf-dots span:nth-child(2) { animation-delay: 0.15s; }
.vf-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes vf-dot {
  0%, 100% { transform: translateY(0); opacity: 0.5; }
  50% { transform: translateY(-4px); opacity: 1; }
}

/* Caption */
.vf-caption {
  text-align: center;
  min-height: 70px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.vf-cap-title { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
.vf-cap-sub { font-size: 12px; color: var(--vf-muted-fg); max-width: 240px; }
.vf-text-warn { color: var(--vf-warn); }

.vf-btn, .vf-btn-secondary {
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  background: var(--vf-primary);
  color: var(--vf-primary-foreground);
  transition: opacity 0.15s ease;
}
.vf-btn:hover { opacity: 0.92; }
.vf-btn-secondary { background: var(--vf-muted); color: var(--vf-fg); }

.vf-end-call {
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklch, var(--vf-warn) 35%, transparent);
  background: transparent;
  color: var(--vf-warn);
  font-size: 13px;
  transition: background 0.15s ease;
}
.vf-end-call:hover { background: var(--vf-warn-bg); }

/* Transcript */
.vf-transcript-wrap { width: 100%; }
.vf-transcript {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--vf-border);
  background: var(--vf-muted);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vf-bubble {
  max-width: 85%;
  padding: 6px 10px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}
.vf-bubble-user {
  align-self: flex-end;
  background: color-mix(in oklch, var(--vf-primary) 18%, transparent);
  color: var(--vf-fg);
  border-top-right-radius: 4px;
}
.vf-bubble-assistant {
  align-self: flex-start;
  background: transparent;
  padding: 4px 0;
  max-width: 95%;
}

.vf-typing {
  display: inline-flex;
  gap: 4px;
  padding: 6px 10px;
  background: var(--vf-border);
  border-radius: 12px;
  align-self: flex-start;
}
.vf-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vf-muted-fg);
  animation: vf-typing 1s ease-in-out infinite;
}
.vf-typing span:nth-child(2) { animation-delay: 0.15s; }
.vf-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes vf-typing {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
`;
