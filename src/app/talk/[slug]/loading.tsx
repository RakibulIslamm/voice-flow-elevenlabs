export default function TalkLoading() {
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-surface p-4 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--voice) 14%, transparent), transparent 60%)',
        }}
      />
      <div className="relative mx-auto w-full max-w-md animate-pulse rounded-3xl border border-border/60 bg-card/70 p-8 shadow-xl backdrop-blur-md">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-3 w-24 rounded bg-muted" />
          <div className="mx-auto h-9 w-52 rounded bg-muted" />
          <div className="mx-auto h-3 w-64 rounded bg-muted/70" />
        </div>
        <div className="my-10 grid place-items-center">
          <div className="size-44 rounded-full bg-muted/70 sm:size-52" />
        </div>
        <div className="space-y-2 text-center">
          <div className="mx-auto h-5 w-32 rounded bg-muted" />
          <div className="mx-auto h-3 w-48 rounded bg-muted/70" />
        </div>
        <div className="mt-8 h-32 rounded-2xl bg-muted/40" />
      </div>
    </div>
  );
}
