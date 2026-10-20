"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { VE_SNEAKER_FAMILIES } from "@/lib/ve-sneakers";

const INTERVAL = 5000;

export default function SneakerCarousel({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const family = VE_SNEAKER_FAMILIES[index] ?? VE_SNEAKER_FAMILIES[0];
  const paused = pointerInside || focusWithin || userPaused;

  // Respect the OS motion preference (checked after mount to stay SSR-safe).
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frame = window.requestAnimationFrame(() => setReducedMotion(query.matches));
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => {
      window.cancelAnimationFrame(frame);
      query.removeEventListener("change", onChange);
    };
  }, []);

  // Only animate while on screen: saves battery on mobile when scrolled away.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setInView(true));
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || paused || !inView) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % VE_SNEAKER_FAMILIES.length),
      INTERVAL,
    );
    return () => window.clearInterval(timer);
  }, [inView, paused, reducedMotion]);

  function moveBy(offset: number) {
    setIndex((current) => (current + offset + VE_SNEAKER_FAMILIES.length) % VE_SNEAKER_FAMILIES.length);
  }

  function updateFocusWithin(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
  }

  return (
    <div
      ref={containerRef}
      className={`w-full ${className ?? ""}`}
      role="region"
      aria-label="Featured sneaker families"
      aria-roledescription="carousel"
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={updateFocusWithin}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/15 bg-ink shadow-[0_28px_90px_rgba(5,8,26,0.45)]">
        {VE_SNEAKER_FAMILIES.map((item, itemIndex) => (
          <div
            key={item.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${itemIndex === index ? "opacity-100" : "opacity-0"}`}
            aria-hidden={itemIndex !== index}
          >
            <Image
              src={item.imageSrc}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              // The visible slide is the hero, so it is the LCP candidate. Without
              // `priority` it would be lazy-loaded like the two hidden slides.
              //
              // Note: `fetchPriority` was tried here and removed. `next/image`
              // accepts the prop and `get-img-props` includes it in the emitted
              // props, but it does not reach the HTML in this Next/React version —
              // verified against a production build. `priority` is what actually
              // does something: it drops the lazy attribute.
              priority={itemIndex === index}
              loading={itemIndex === index ? undefined : "lazy"}
              className="object-contain"
            />
          </div>
        ))}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-ink/85 via-transparent to-ink/15" />
        <div className="absolute top-4 right-4 z-10 rounded-sm border border-white/20 bg-ink/70 px-3 py-2 font-pixel text-[8px] tracking-widest text-paper/80 backdrop-blur-sm sm:top-6 sm:right-6">
          {String(index + 1).padStart(2, "0")} / {String(VE_SNEAKER_FAMILIES.length).padStart(2, "0")}
        </div>
        <div className="absolute right-4 bottom-5 left-4 z-10 sm:right-7 sm:bottom-7 sm:left-7">
          <span
            className="font-pixel text-[9px] tracking-[0.24em] uppercase"
            style={{ color: `var(--color-${family.id})` }}
          >
            {family.id} / GENESIS
          </span>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">{family.name}</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/75 sm:text-base">{family.tagline}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-1 sm:gap-4">
        <button
          type="button"
          aria-label="Previous sneaker family"
          onClick={() => moveBy(-1)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center border border-foreground/15 bg-surface text-lg text-foreground transition-colors active:scale-95 hover:border-brand/50 hover:text-brand"
        >
          ‹
        </button>
        <div className="flex flex-1 items-center justify-center gap-0.5 sm:gap-2">
          {VE_SNEAKER_FAMILIES.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Show ${item.name} collection`}
              aria-pressed={index === itemIndex}
              onClick={() => setIndex(itemIndex)}
              className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center px-0 font-pixel text-[7px] uppercase tracking-wider transition-colors active:scale-95 sm:px-3 sm:text-[8px] ${index === itemIndex ? "text-foreground" : "text-foreground/45 hover:text-foreground"}`}
            >
              <span className="flex items-center gap-1 sm:gap-2">
                <span
                  aria-hidden="true"
                  className={`size-2 ${index === itemIndex ? "bg-current" : "bg-foreground/25"}`}
                  style={index === itemIndex ? { color: `var(--color-${item.id})` } : undefined}
                />
                <span className="hidden sm:inline">{item.name}</span>
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next sneaker family"
          onClick={() => moveBy(1)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center border border-foreground/15 bg-surface text-lg text-foreground transition-colors active:scale-95 hover:border-sol/50 hover:text-sol"
        >
          ›
        </button>
        {!reducedMotion ? (
          <button
            type="button"
            aria-label={userPaused ? "Resume automatic rotation" : "Pause automatic rotation"}
            aria-pressed={userPaused}
            onClick={() => setUserPaused((value) => !value)}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center border border-foreground/15 bg-surface font-pixel text-[9px] text-foreground/65 transition-colors active:scale-95 hover:border-luna/50 hover:text-luna"
          >
            {userPaused ? "▶" : "Ⅱ"}
          </button>
        ) : null}
      </div>
      <span className="sr-only" aria-live="polite">Showing the {family.name} sneaker collection.</span>
    </div>
  );
}
