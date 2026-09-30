"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useGameLaunch } from "@/components/GameLaunch";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Boot the full-screen launch loader before navigating. */
  launch?: boolean;
};

/// Primary mobile navigation. Five destinations, always reachable with a thumb.
/// Everything else lives in the "More" sheet opened from the header.
export const MOBILE_NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: (
      <>
        <path d="M3 10.75 12 3.5l9 7.25" />
        <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
      </>
    ),
  },
  {
    href: "/mint",
    label: "Mint",
    icon: (
      <>
        <path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5" />
        <path d="M6 6l2.6 2.6M15.4 15.4 18 18M18 6l-2.6 2.6M8.6 15.4 6 18" />
      </>
    ),
  },
  {
    href: "/collection",
    label: "veSneakers",
    icon: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
      </>
    ),
  },
  {
    href: "/play",
    label: "Play",
    launch: true,
    icon: (
      <>
        <path d="M8 5.5v13l11-6.5-11-6.5Z" />
        <path d="M4 6v12" />
      </>
    ),
  },
  {
    href: "/marketplace",
    label: "Market",
    icon: (
      <>
        <path d="M5 8h14l-1.2 11a1.5 1.5 0 0 1-1.5 1.35H7.7A1.5 1.5 0 0 1 6.2 19L5 8Z" />
        <path d="M8.5 8V6.5a3.5 3.5 0 1 1 7 0V8" />
      </>
    ),
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export default function MobileNav() {
  const pathname = usePathname();
  const { launch } = useGameLaunch();
  const [hidden, setHidden] = useState(false);

  // Hide while scrolling down, reveal on the way up: keeps the bar out of the
  // way when reading and one flick away when navigating.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (Math.abs(delta) < 8) return;
      setHidden(delta > 0 && y > 120);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Always reveal on route change so the new screen starts with navigation visible.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHidden(false));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <nav
      aria-label="Primary"
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-brand/20 bg-surface/95 pb-safe backdrop-blur-xl transition-transform duration-300 ease-out md:hidden ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  if (!item.launch) return;
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                  event.preventDefault();
                  launch(item.href);
                }}
                className={`flex min-h-[3.75rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition-colors active:scale-95 ${
                  active ? "text-brand" : "text-foreground/55"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-6 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {item.icon}
                </svg>
                <span className={`text-[10px] leading-none ${active ? "font-bold" : "font-medium"}`}>
                  {item.label}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-0.5 w-5 rounded-full transition-colors ${active ? "bg-brand" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
