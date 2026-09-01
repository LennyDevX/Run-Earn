import { memo } from "react";

function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl items-center justify-between border-t border-foreground/8 px-6 py-8 text-sm text-foreground/50">
      <span className="font-pixel text-[10px] text-foreground">
        RUN<span className="text-mint">&</span>EARN
      </span>
      <span>© 2026 — Collect the future</span>
    </footer>
  );
}

export default memo(Footer);
