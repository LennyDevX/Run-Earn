import Image from "next/image";
import { memo } from "react";

function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 border-t border-foreground/8 px-6 py-8 text-center text-sm text-foreground/50 sm:flex-row sm:text-left">
      <Image
        src="/AirenBlack.webp"
        alt="Airen"
        width={120}
        height={66}
        sizes="120px"
        className="h-auto w-24 object-contain dark:hidden"
      />
      <Image
        src="/AirenWhite.png"
        alt="Airen"
        width={120}
        height={66}
        sizes="120px"
        className="hidden h-auto w-24 object-contain dark:block"
      />
      <span>© 2026 — Collect the future</span>
    </footer>
  );
}

export default memo(Footer);
