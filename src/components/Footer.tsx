import { memo } from "react";

function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 border-t border-foreground/8 px-6 py-8 text-center text-sm text-foreground/50 sm:flex-row sm:text-left">
      <span className="font-pixel text-[10px] text-foreground">
        RUN<span className="text-astra">&</span>EARN
      </span>
      <span>© 2026 — Collect the future</span>
    </footer>
  );
}

export default memo(Footer);
