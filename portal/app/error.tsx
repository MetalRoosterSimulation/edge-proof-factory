"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-lg font-semibold">Console error</h1>
      <p className="mt-2 text-sm text-[var(--c-ink2)]">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 border border-[var(--c-line)] px-3 py-1.5 text-sm text-[var(--c-action)]"
      >
        Reload the console
      </button>
    </div>
  );
}
