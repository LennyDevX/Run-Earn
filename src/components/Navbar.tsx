"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import WalletButton from "@/components/WalletButton";
import MoreSheet from "@/components/MoreSheet";
import { usePolygonWallet } from "@/components/Providers";
import { useProfile } from "@/hooks/useProfile";

/// Desktop navigation (>= md): five primary destinations, everything else grouped
/// inside the "More" dropdown.
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/mint", label: "Mint" },
  { href: "/collection", label: "veSneakers" },
  { href: "/game", label: "Game" },
  { href: "/marketplace", label: "Market" },
];

/// Dropdown groups shown on desktop inside the "More" menu.
const MENU_GROUPS = [
  {
    label: "Play",
    links: [
      {
        href: "/workshop",
        label: "Workshop",
        description: "Equip mods, burn kits, and forge your sneakers.",
      },
      {
        href: "/badges",
        label: "Badges",
        description: "Claim achievement badges earned by your veSneakers.",
      },
      {
        href: "/my-nfts",
        label: "My NFTs",
        description: "Every sneaker and mod you minted from this wallet.",
      },
    ],
  },
  {
    label: "Earn",
    links: [
      {
        href: "/staking",
        label: "Staking",
        description: "Deposit POL, claim rewards, lock sneakers for APY.",
      },
      {
        href: "/defi",
        label: "DeFi overview",
        description: "How the yield engine and rarity tiers work.",
      },
    ],
  },
  {
    label: "Project",
    links: [
      {
        href: "/roadmap",
        label: "Roadmap",
        description: "What shipped and what is coming next.",
      },
    ],
  },
];

/// Routes that do not fit in the mobile bottom bar, surfaced through the sheet.
const SECONDARY_LINKS = MENU_GROUPS.flatMap((group) => group.links);

/// Avatar/identity shortcut — sits left of the theme toggle on desktop and is
/// also reachable on mobile (where the toggle lives inside the More sheet).
function ProfileButton() {
  const pathname = usePathname();
  const wallet = usePolygonWallet();
  const { avatarUrl } = useProfile(wallet.address);
  const active = pathname === "/profile";

  return (
    <Link
      href="/profile"
      aria-label="Open your profile"
      aria-current={active ? "page" : undefined}
      className={`flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-all active:scale-95 ${
        active
          ? "border-brand/60 bg-brand/10 shadow-sm shadow-brand/20"
          : "border-foreground/15 bg-surface text-foreground/70 hover:border-foreground/30 hover:text-foreground"
      }`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
        </svg>
      )}
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuActive = SECONDARY_LINKS.some((link) => pathname === link.href);

  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-brand/15 bg-background/85 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-4 md:py-6">
          <Link
            href="/"
            aria-label="Airen home"
            className="group relative flex h-10 w-[4.5rem] shrink-0 items-center justify-center overflow-hidden sm:w-[5.5rem]"
          >
            <Image
              src="/LogoAirenBlack.webp"
              alt=""
              fill
              sizes="96px"
              loading="eager"
              className="scale-[2.45] object-cover object-[50%_42%] transition-transform duration-700 ease-out group-hover:scale-[2.55] dark:hidden"
            />
            <Image
              src="/LogoAiren.webp"
              alt=""
              fill
              sizes="96px"
              loading="eager"
              className="hidden scale-[2.45] object-cover object-[50%_42%] drop-shadow-[0_0_8px_rgba(72,213,255,0.38)] transition-transform duration-700 ease-out group-hover:scale-[2.55] dark:block"
            />
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
                  className={`relative py-2 transition-colors after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-brand after:transition-transform hover:text-foreground ${
                    active ? "font-semibold text-foreground after:scale-x-100" : "text-foreground/60 after:scale-x-0 hover:after:scale-x-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* Grouped overflow menu */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={`flex cursor-pointer items-center gap-1.5 transition-colors hover:text-foreground ${
                  menuActive || menuOpen ? "font-semibold text-foreground" : "text-foreground/60"
                }`}
              >
                More
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className={`size-3.5 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="animate-backdrop-in absolute right-0 top-full mt-4 w-72 rounded-2xl border border-brand/20 bg-surface/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
                >
                  {MENU_GROUPS.map((group) => (
                    <div key={group.label} className="py-1 first:pt-0 last:pb-0">
                      <p className="px-3 pb-1 pt-2 font-pixel text-[9px] uppercase tracking-widest text-foreground/40">
                        {group.label}
                      </p>
                      {group.links.map((link) => {
                        const active = pathname === link.href;
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            role="menuitem"
                            aria-current={active ? "page" : undefined}
                            onClick={() => setMenuOpen(false)}
                            className={`flex flex-col rounded-xl px-3 py-2.5 transition-colors ${
                              active ? "bg-brand/10" : "hover:bg-foreground/5"
                            }`}
                          >
                            <span
                              className={`text-sm font-semibold ${active ? "text-brand" : "text-foreground"}`}
                            >
                              {link.label}
                            </span>
                            <span className="mt-0.5 text-xs leading-relaxed text-foreground/55">
                              {link.description}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </nav>

          <div className="flex items-center gap-2">
            <ProfileButton />
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
        description="Everything else in Airen."
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
