"use client";

import { useEffect, useRef, useState } from "react";
import PixelSneaker from "@/components/PixelSneaker";

const DESIGNS = 4;
const INTERVAL = 2500;
const FADE_DURATION = 500;

export default function SneakerCarousel({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const swapRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisible(false);
      swapRef.current = window.setTimeout(() => {
        setIndex((i) => (i + 1) % DESIGNS);
        setVisible(true);
      }, FADE_DURATION);
    }, INTERVAL);
    return () => {
      window.clearInterval(timer);
      if (swapRef.current) window.clearTimeout(swapRef.current);
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <PixelSneaker
        design={index}
        className="w-full transition-opacity duration-500 ease-in-out"
        style={{ opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}
