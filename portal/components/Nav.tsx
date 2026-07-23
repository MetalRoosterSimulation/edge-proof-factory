import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
          Edge Proof Factory
        </Link>
        <nav className="flex gap-6 text-sm">
          <Link href="/" className="hover:underline">
            Proof kits
          </Link>
          <Link href="/ledger" className="hover:underline">
            Build ledger
          </Link>
        </nav>
      </div>
    </header>
  );
}
