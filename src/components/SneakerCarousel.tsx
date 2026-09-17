"use client";

import { useEffect, useRef, useState } from "react";
import PixelSneaker, { PIXEL_SNEAKER_DESIGNS } from "@/components/PixelSneaker";

const INTERVAL = 2500;
const FADE_DURATION = 500;

export default function SneakerCarousel({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

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
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || !inView) return;
    let swap: number | undefined;
    const timer = window.setInterval(() => {
      setVisible(false);
      swap = window.setTimeout(() => {
        setIndex((i) => (i + 1) % PIXEL_SNEAKER_DESIGNS);
        setVisible(true);
      }, FADE_DURATION);
    }, INTERVAL);
    return () => {
      window.clearInterval(timer);
      if (swap) window.clearTimeout(swap);
    };
  }, [inView, reducedMotion]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <PixelSneaker
        design={index}
        className="w-full transition-opacity duration-500 ease-in-out"
        style={{ opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}
