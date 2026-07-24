import { Console } from "@/components/console/Console";

// The app IS the demo: a static shell, everything live client-side. No
// backend at runtime — the console must work even with zero configuration.
export default function HomePage() {
  return <Console />;
}
