import { KeyRound, Phone, ShieldCheck } from 'lucide-react';

// Honest, static value props — no fabricated metrics or dead UI. These
// mirror the real product positioning used across the marketing site.
const POINTS = [
  { icon: KeyRound, label: 'Bring your own ElevenLabs key — you own the voice' },
  { icon: Phone, label: 'Web + phone, one agent (BYOK Twilio on Pro)' },
  { icon: ShieldCheck, label: 'Credentials encrypted with AES-256-GCM' },
];

export function AuthHero() {
  return (
    <div className="relative hidden h-full overflow-hidden bg-voice text-voice-foreground lg:flex lg:flex-col">
      {/* Brand-toned depth: warm darkening in the corners + soft highlights,
          all derived from the --voice token so the panel reads as the same
          amber accent used throughout the app. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(80% 70% at 15% 0%, color-mix(in oklch, var(--voice) 78%, white) 0%, transparent 55%), radial-gradient(90% 80% at 100% 100%, color-mix(in oklch, var(--voice) 70%, black) 0%, transparent 55%)',
        }}
      />
      <div className="pointer-events-none absolute -left-24 top-24 size-72 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-16 size-80 rounded-full bg-black/10 blur-3xl" />

      <div className="relative flex h-full flex-col justify-between p-12">
        {/* Brand */}
        <div className="space-y-4">
          <h2 className="font-serif text-6xl leading-none">VoiceFlow</h2>
          <p className="max-w-sm text-lg text-voice-foreground/80">
            Your AI receptionist — booking appointments, qualifying leads, and answering
            calls 24/7.
          </p>
        </div>

        {/* Honest value props */}
        <ul className="space-y-3">
          {POINTS.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.label} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-voice-foreground/10 ring-1 ring-voice-foreground/15">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-medium text-voice-foreground/90">{p.label}</span>
              </li>
            );
          })}
        </ul>

        {/* Quiet footer line */}
        <p className="text-sm text-voice-foreground/70">
          Start free — 100 platform calls, no credit card.
        </p>
      </div>
    </div>
  );
}
