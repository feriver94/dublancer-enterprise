"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="phase-dashboard__error" role="alert"><h1>Unable to load this view</h1><p>The request failed safely. Your data was not changed.</p><button type="button" onClick={reset}>Retry</button></main>;
}
