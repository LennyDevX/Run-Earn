"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import WalletButton from "@/components/WalletButton";
import MoreSheet from "@/components/MoreSheet";

/// Desktop navigation (>= md).
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/mint", label: "Mint" },
  { href: "/collection", label: "veSneakers" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/workshop", label: "Workshop" },
  { href: "/badges", label: "Badges" },
  { href: "/game", label: "Game" },
  { href: "/defi", label: "DeFi" },
  { href: "/staking", label: "Staking" },
  { href: "/roadmap", label: "Roadmap" },
];

/// Routes that do not fit in the mobile bottom bar, surfaced through the sheet.
const SECONDARY_LINKS = [
  {
    href: "/workshop",
    label: "Workshop",
    description: "Equip mods, burn repair kits, and forge your sneakers.",
  },
  {
    href: "/badges",
    label: "Badges",
    description: "Claim achievement badges earned by your veSneakers.",
  },
  {
    href: "/staking",
    label: "Staking",
    description: "Deposit POL, claim rewards, lock sneakers for an APY boost.",
  },
  {
    href: "/my-nfts",
    label: "My NFTs",
    description: "Every sneaker you minted from this wallet.",
  },
  {
    href: "/defi",
    label: "DeFi overview",
    description: "How the yield engine and rarity tiers work.",
  },
  {
    href: "/roadmap",
    label: "Roadmap",
    description: "What shipped and what is coming next.",
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-foreground/5 bg-background/85 pt-safe backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-4 md:py-6">
          <Link href="/" className="font-pixel text-sm tracking-tight">
            RUN<span className="text-mint">&</span>EARN
          </Link>

          {/* Desktop navigation */}
          <nav aria-label="Primary" className="hidden items-center gap-8 text-sm font-medium md:flex">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`transition-colors hover:text-foreground ${
                    active ? "font-semibold text-foreground" : "text-foreground/60"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <WalletButton />

            {/* Mobile overflow menu */}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-foreground/15 bg-surface text-foreground/70 transition-colors active:scale-95 md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="MORE"
        description="Everything else in RUN&EARN."
      >
        <div className="flex flex-col gap-2">
          {SECONDARY_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMoreOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[4.25rem] flex-col justify-center rounded-2xl border px-4 py-3 transition-colors active:scale-[0.99] ${
                  active
                    ? "border-mint/40 bg-mint/10"
                    : "border-foreground/10 bg-background hover:border-foreground/25"
                }`}
              >
                <span className={`text-sm font-bold ${active ? "text-mint" : "text-foreground"}`}>
                  {link.label}
                </span>
                <span className="mt-1 text-xs leading-relaxed text-foreground/55">
                  {link.description}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-foreground/10 bg-background px-4 py-3">
          <div>
            <span className="block text-sm font-bold">Appearance</span>
            <span className="block text-xs text-foreground/55">Switch between light and dark.</span>
          </div>
          <ThemeToggle />
        </div>
      </MoreSheet>
    </>
  );
}
