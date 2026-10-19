import Image from "next/image";
import Link from "next/link";
import { memo } from "react";

const FOOTER_LINKS = [
  { href: "/roadmap", label: "Roadmap" },
  { href: "/treasury", label: "Treasury" },
  { href: "/collection", label: "Collection" },
  { href: "/marketplace", label: "Marketplace" },
] as const;

function Footer() {
  return (
    <footer className="mx-auto w-full max-w-6xl border-t border-foreground/8 px-6 py-10">
      <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-end lg:justify-between">
        <Link href="/" aria-label="Airen home" className="group inline-flex">
          <Image
            src="/AirenBlack.webp"
            alt="Airen"
            width={220}
            height={121}
            sizes="(max-width: 1024px) 176px, 220px"
            className="h-auto w-36 object-contain transition-transform duration-500 group-hover:scale-[1.03] sm:w-44 dark:hidden"
          />
          <Image
            src="/AirenWhite.png"
            alt="Airen"
            width={220}
            height={121}
            sizes="(max-width: 1024px) 176px, 220px"
            className="hidden h-auto w-36 object-contain transition-transform duration-500 group-hover:scale-[1.03] sm:w-44 dark:block"
          />
        </Link>

        <div className="flex flex-col items-center gap-5 lg:items-end">
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="min-h-11 inline-flex items-center font-medium text-foreground/60 transition-colors hover:text-brand dark:hover:text-mint"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <span className="text-sm text-foreground/50">© 2026 — Collect the future</span>
        </div>
      </div>
    </footer>
  );
}

export default memo(Footer);
