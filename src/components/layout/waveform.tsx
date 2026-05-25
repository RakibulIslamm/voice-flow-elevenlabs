import { cn } from '@/lib/utils';

/**
 * Decorative voice-waveform stroke. Used under page headers as a brand
 * accent that ties the dashboard to the product (voice agents).
 *
 * - Renders as an inline SVG so it inherits `currentColor` from its parent.
 * - The bar heights are a fixed deterministic pattern (no Math.random)
 *   to avoid SSR/CSR hydration mismatches.
 */
const HEIGHTS = [
  4, 8, 14, 10, 18, 22, 16, 9, 6, 12, 20, 26, 22, 14, 8, 5, 10, 16, 24, 30, 26, 18,
  12, 7, 4, 9, 15, 22, 28, 32, 28, 21, 14, 9, 6, 10, 16, 22, 18, 12, 8, 4, 7, 11, 6,
  4, 9, 12, 7, 4,
];

export function Waveform({
  className,
  height = 24,
  bars = HEIGHTS.length,
  strokeWidth = 1.4,
}: {
  className?: string;
  height?: number;
  bars?: number;
  strokeWidth?: number;
}) {
  const slice = HEIGHTS.slice(0, bars);
  const width = bars * 4;
  const centerY = height / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden
      className={cn('text-voice/70', className)}
    >
      {slice.map((h, i) => {
        const x = i * 4 + 2;
        const half = Math.min(h, height - 2) / 2;
        return (
          <line
            key={i}
            x1={x}
            x2={x}
            y1={centerY - half}
            y2={centerY + half}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
