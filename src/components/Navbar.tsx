"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import WalletButton from "@/components/WalletButton";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/mint", label: "Mint" },
  { href: "/collection", label: "veSneakers" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/game", label: "Game" },
  { href: "/defi", label: "DeFi" },
  { href: "/staking", label: "Staking" },
  { href: "/roadmap", label: "Roadmap" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="font-pixel text-sm tracking-tight">
        RUN<span className="text-mint">&</span>EARN
      </Link>
      <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`transition-colors hover:text-foreground ${
                active ? "font-semibold text-foreground" : "text-foreground/60"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <WalletButton />
      </div>
    </header>
  );
}
