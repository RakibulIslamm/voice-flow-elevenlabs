import { Play, Phone, Calendar } from 'lucide-react';

// Deterministic waveform — same heights on server + client so React 19 doesn't
// trigger a hydration mismatch / subtree re-render.
const WAVEFORM_HEIGHTS = [
  8, 14, 22, 18, 10, 6, 12, 20, 26, 22, 14, 8, 4, 10, 18, 24, 28, 24, 16, 10,
  6, 8, 14, 22, 28, 30, 24, 18, 12, 8, 4, 10, 16, 22, 26, 22, 16, 10, 6, 8,
];

export function AuthHero() {
  return (
    <div className="relative hidden h-full overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-500 lg:flex lg:flex-col">
      {/* Decorative blurs */}
      <div className="pointer-events-none absolute -left-24 top-24 size-72 rounded-full bg-white/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-16 size-80 rounded-full bg-amber-300/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_120%,rgba(255,255,255,0.15),transparent_50%)]" />

      <div className="relative flex h-full flex-col justify-between p-12">
        {/* Top: brand */}
        <div className="space-y-3">
          <h2 className="font-serif text-6xl leading-none text-white">VoiceFlow</h2>
          <p className="max-w-sm text-lg text-white/85">
            Your AI receptionist — booking appointments, qualifying leads, and answering
            calls 24/7.
          </p>
        </div>

        {/* Middle: outcome chips */}
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-white/60">
            Live, in production
          </p>
          <div className="grid gap-2">
            <Chip icon={<Calendar className="size-3.5" />} label="42 appointments booked this week" />
            <Chip icon={<Phone className="size-3.5" />} label="118 calls answered in 18 ms avg" />
          </div>
        </div>

        {/* Bottom: mini player teaser (visual only) */}
        <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/55">
            Listen to a real call
          </p>
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              aria-label="Play sample call (coming soon)"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-purple-700 shadow-lg transition hover:scale-105 active:scale-95"
            >
              <Play className="size-4 fill-current" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">
                Dental — appointment booked
              </div>
              <div className="mt-2 flex items-end gap-0.5">
                {WAVEFORM_HEIGHTS.map((h, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="w-[3px] rounded-sm bg-white/75"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
            </div>
            <div className="shrink-0 text-xs tabular-nums text-white/65">0:34</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white/90 backdrop-blur">
      {icon}
      {label}
    </div>
  );
}
