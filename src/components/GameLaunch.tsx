"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GameLaunchOverlay from "@/components/GameLaunchOverlay";

type GameLaunchContextValue = {
  /** Covers the screen with the launch loader, then navigates. */
  launch: (href: string) => void;
};

const GameLaunchContext = createContext<GameLaunchContextValue | null>(null);

export function useGameLaunch() {
  const context = useContext(GameLaunchContext);
  if (!context) throw new Error("useGameLaunch must be used within GameLaunchProvider");
  return context;
}

/// Mounts once in the root layout so the launch screen can appear on navigation
/// — before the destination route renders — instead of inside the route itself.
export function GameLaunchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  const launch = useCallback(
    (href: string) => {
      // Reduced motion: skip the show and navigate straight away.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        router.push(href);
        return;
      }
      setTarget(href);
    },
    [router],
  );

  const finish = useCallback(() => {
    if (target) router.push(target);
    setTarget(null);
  }, [router, target]);

  const value = useMemo<GameLaunchContextValue>(() => ({ launch }), [launch]);

  return (
    <GameLaunchContext.Provider value={value}>
      {children}
      {target ? <GameLaunchOverlay onDone={finish} /> : null}
    </GameLaunchContext.Provider>
  );
}

type LaunchLinkProps = Omit<ComponentProps<typeof Link>, "href" | "onClick"> & {
  href: string;
  /** Runs before the loader takes over — e.g. closing a sheet. */
  onLaunch?: () => void;
};

/// A `next/link` that boots the game loader before navigating to `href`.
export function LaunchLink({ href, onLaunch, children, ...props }: LaunchLinkProps) {
  const { launch } = useGameLaunch();

  return (
    <Link
      href={href}
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        // Let modifier-clicks and middle-clicks open a new tab normally.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        onLaunch?.();
        launch(href);
      }}
    >
      {children}
    </Link>
  );
}
