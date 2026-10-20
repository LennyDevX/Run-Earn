# Airen Mobile v2.0 — plan

The mobile experience already works: the bottom nav, safe areas, touch hygiene,
reduced motion and the PWA shell are done and described in
[`mobile-experience.md`](mobile-experience.md). This plan is what comes **after**
that, and deliberately does not repeat the roadmap already listed there.

Two things it adds that the existing roadmap does not cover:

1. **Robustness.** There is no `error.tsx`, no `not-found.tsx`, no `loading.tsx`
   and no `Suspense` anywhere. A render throw leaves a blank screen with no way
   back, and every navigation is a blind wait. On a phone there is no DevTools to
   explain either.
2. **Platform capabilities Next 16 already gives us** — View Transitions,
   container queries, `content-visibility`, native `<dialog>`, scroll-driven
   animations — none of which need a dependency.

---

## Phase A — Robustness

The work nobody sees and everybody feels. First, because it fixes failure modes
that currently strand the user.

| # | Item | Why |
| --- | --- | --- |
| A1 | `error.tsx` at the root and in `/game`, `/workshop`, `/profile` | A crash shows nothing. Per-group boundaries keep the nav alive when one dashboard fails |
| A2 | `not-found.tsx` | A bad link shows Next's default 404: no brand, no route back |
| A3 | `loading.tsx` per route | Skeletons shaped like the real content, not spinners |
| A4 | `useTransition` on navigation | The tap gives feedback before the route mounts |
| A5 | `Suspense` around heavy dashboards | The shell paints before the data |

**Done when:** no route can leave the user on an empty screen, whether it is
loading or failing.

## Phase B — Platform

| # | Item | Why |
| --- | --- | --- |
| B1 | View Transitions | Next 16 supports `<ViewTransition>` with no config, and App Router navigations already run as transitions. A sneaker card can morph into its detail instead of the page blinking |
| B2 | Container queries | Cards should adapt to their container, not the viewport |
| B3 | `content-visibility: auto` | Long collections stop rendering off-screen work |
| B4 | Scroll-driven animations | Replaces `IntersectionObserver` reveals; less main-thread work |
| B5 | Native `<dialog>` / `popover` | Focus trap, backdrop and `inert` for free in `MoreSheet` |
| B6 | `interactiveWidget` | The keyboard currently resizes the layout instead of overlaying it — the most visible mobile bug when typing |
| B7 | `text-wrap: pretty` / `balance` | Line breaking at 320px |
| B8 | `prefers-reduced-transparency` | Joins the reduced-motion handling |
| B9 | `dvh` everywhere | `vh` jumps when the mobile URL bar collapses |

## Phase C — Retention

Mint-wizard draft persistence (a wallet handoff reloads the page and loses the
photo — the worst mobile drop-off), haptics, Web Share, install prompt, nav
badges, amount presets.

## Phase D — Performance, measured

viem multicall in the dashboards, marketplace listing scan to the subgraph,
stale-while-revalidate for the POL price, `fetchPriority` on the LCP image,
Lighthouse mobile budget in CI.

## Phase E — Inclusivity

`prefers-contrast: more`, 200% text-size verification, explicit `:focus-visible`
in sheets. The theme already falls back to `prefers-color-scheme` when nothing is
stored, so "System" is mostly a UI affordance rather than new behaviour.

---

## What this plan deliberately excludes

- **Push notifications.** Justified by the 24h loop, but it needs a service
  worker, VAPID and a backend scheduler. Its own project.
- **Offline with a transaction queue.** A signed transaction sent hours later can
  execute at a price that no longer exists. Offline should be read-only.
- **Passkeys.** The biggest onboarding jump available, but it needs smart
  accounts and a contract change.
- **List virtualisation** before there are long lists. `content-visibility` is
  one line and covers most of it.

## How success is measured

| Metric | Baseline |
| --- | --- |
| Routes with a loading state | 0 / 14 |
| Routes with an error boundary | 0 / 14 |
| Mobile LCP on `/collection` | to measure |
| Lighthouse mobile perf / a11y | to measure |

The first task is measuring, because there is no baseline today and without one
"it got faster" is an opinion.
