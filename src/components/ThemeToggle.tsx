"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
      setDark(document.documentElement.classList.contains("dark"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative flex h-11 w-20 cursor-pointer items-center rounded-full border border-foreground/15 bg-surface px-1 transition-colors duration-300 hover:border-foreground/30 md:h-9 md:w-16"
    >
      <span
        className={`flex size-7 items-center justify-center rounded-full bg-foreground text-xs text-background transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          mounted && dark ? "translate-x-11 md:translate-x-7" : "translate-x-0"
        }`}
      >
        <span className={mounted && dark ? "text-luna" : "text-sol"}>{mounted && dark ? "☾" : "☀"}</span>
      </span>
    </button>
  );
}
