"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const notConfigured = error.name === "SupabaseNotConfiguredError";

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
      <h2 className="font-medium text-amber-900 dark:text-amber-200">
        {notConfigured ? "Supabase is not configured" : "Something went wrong"}
      </h2>
      <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-200/80">
        {notConfigured
          ? "Copy .env.example to .env.local, fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from `supabase status` (local) or your project's API settings (hosted), then reload."
          : error.message}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-md border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40"
      >
        Try again
      </button>
    </div>
  );
}
