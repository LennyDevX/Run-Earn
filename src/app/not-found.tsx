import Link from "next/link";

/// Custom 404.
///
/// Next's default is an unstyled page in English with no way back into the app.
/// This one keeps the visitor inside Airen and offers the same five destinations
/// as the bottom navigation, so a mistyped or stale link is a detour rather than
/// a dead end.
const DESTINATIONS = [
  { href: "/", label: "Home", hint: "The universe, and the store" },
  { href: "/mint", label: "Mint", hint: "Turn a photo into a collectible" },
  { href: "/collection", label: "veSneakers", hint: "Astra, Sol and Luna" },
  { href: "/game", label: "Game", hint: "Activate, earn, level up" },
  { href: "/marketplace", label: "Market", hint: "Buy, sell, auction" },
];

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-8 px-6 py-20 text-center">
      <span className="font-pixel text-[10px] tracking-widest text-foreground/40">OFF THE GRID</span>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          404<span className="text-mint">.</span>
        </h1>
        <p className="text-sm leading-relaxed text-foreground/60">
          This route does not exist. Nothing is broken — the link just points somewhere that was never here.
        </p>
      </div>

      <nav aria-label="Destinations" className="flex w-full flex-col gap-2">
        {DESTINATIONS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-foreground/10 bg-surface px-5 py-3 text-left transition-colors active:scale-[0.99] hover:border-mint/50"
          >
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{item.label}</span>
              <span className="text-[11px] text-foreground/45">{item.hint}</span>
            </span>
            <span aria-hidden className="text-foreground/30">
              →
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
