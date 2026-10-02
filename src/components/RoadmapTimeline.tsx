"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ROADMAP_PHASES,
  ROADMAP_PROGRESS,
  type RoadmapAccent,
  type RoadmapMilestone,
  type RoadmapPhase,
  type RoadmapStatus,
} from "@/lib/roadmap";

const STATUS: Record<
  RoadmapStatus,
  { label: string; chip: string; dot: string; halo: string; rail: string }
> = {
  done: {
    label: "Shipped",
    chip: "border-mint/30 bg-mint/10 text-mint",
    dot: "bg-mint shadow-[0_0_10px_rgba(76,229,192,0.75)]",
    halo: "bg-mint/45",
    rail: "bg-mint/40",
  },
  active: {
    label: "In progress",
    chip: "border-brand/35 bg-brand/10 text-brand",
    dot: "bg-brand shadow-[0_0_12px_rgba(72,213,255,0.85)]",
    halo: "bg-brand/50",
    rail: "bg-brand/35",
  },
  next: {
    label: "Next up",
    chip: "border-magma/30 bg-magma/10 text-magma",
    dot: "bg-magma shadow-[0_0_10px_rgba(255,112,94,0.65)]",
    halo: "bg-magma/40",
    rail: "bg-foreground/15",
  },
  planned: {
    label: "Planned",
    chip: "border-foreground/12 bg-foreground/5 text-foreground/50",
    dot: "bg-foreground/25",
    halo: "bg-foreground/15",
    rail: "bg-foreground/12",
  },
};

const ACCENT: Record<
  RoadmapAccent,
  { text: string; border: string; soft: string; bar: string; bloom: string; corner: string }
> = {
  mint: {
    text: "text-mint",
    border: "border-mint/25",
    soft: "bg-mint/8",
    bar: "bg-mint",
    bloom: "bg-mint/12",
    corner: "text-mint",
  },
  brand: {
    text: "text-brand",
    border: "border-brand/25",
    soft: "bg-brand/8",
    bar: "bg-brand",
    bloom: "bg-brand/12",
    corner: "text-brand",
  },
  astra: {
    text: "text-astra",
    border: "border-astra/25",
    soft: "bg-astra/8",
    bar: "bg-astra",
    bloom: "bg-astra/12",
    corner: "text-astra",
  },
  sol: {
    text: "text-sol",
    border: "border-sol/25",
    soft: "bg-sol/8",
    bar: "bg-sol",
    bloom: "bg-sol/12",
    corner: "text-sol",
  },
};

/// Reveals children once they scroll into view. Falls back to visible when
/// IntersectionObserver is unavailable, and `prefers-reduced-motion` collapses
/// the transition globally (see globals.css).
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-visible={visible ? "true" : "false"}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${className}`}
    >
      {children}
    </div>
  );
}

function Corners({ className = "" }: { className?: string }) {
  return (
    <>
      <span aria-hidden className={`hud-corner hud-corner-tl ${className}`} />
      <span aria-hidden className={`hud-corner hud-corner-tr ${className}`} />
      <span aria-hidden className={`hud-corner hud-corner-bl ${className}`} />
      <span aria-hidden className={`hud-corner hud-corner-br ${className}`} />
    </>
  );
}

function StatusChip({ status, className = "" }: { status: RoadmapStatus; className?: string }) {
  const meta = STATUS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase ${meta.chip} ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function PhaseDot({ status }: { status: RoadmapStatus }) {
  const meta = STATUS[status];
  return (
    <span className="relative flex size-3 items-center justify-center">
      {status === "active" ? (
        <span aria-hidden className={`absolute inset-0 rounded-full animate-pulse-ring ${meta.halo}`} />
      ) : null}
      <span aria-hidden className={`relative size-2 rounded-full ${meta.dot}`} />
    </span>
  );
}

function ProgressConsole() {
  const [armed, setArmed] = useState(false);
  const { shipped, total, phases } = ROADMAP_PROGRESS;
  const percent = Math.round((shipped / total) * 100);
  const shippedPhases = ROADMAP_PHASES.filter((phase) => phase.status === "done").length;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setArmed(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <Reveal>
      <section
        aria-label="Roadmap progress"
        className="group relative overflow-hidden rounded-3xl border border-brand/20 bg-surface p-6 sm:p-8"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-brand/12 blur-3xl animate-drift"
        />
        <span aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-60" />
        <Corners className="text-brand" />

        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="font-pixel text-[10px] tracking-[0.22em] text-brand">MISSION STATUS</span>
            <p className="mt-3 flex items-baseline gap-3">
              <span className="font-mono text-5xl font-bold tabular-nums text-foreground sm:text-6xl">
                {percent}
              </span>
              <span className="font-mono text-lg text-foreground/45">%</span>
            </p>
            <p className="mt-2 text-sm text-foreground/55">
              {shipped} of {total} milestones shipped
              <span aria-hidden className="mx-2 text-foreground/25">
                /
              </span>
              {shippedPhases} of {phases} phases complete
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:w-auto">
            {[
              { label: "Contracts", value: "15" },
              { label: "Tests", value: "430" },
              { label: "Routes", value: "12" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-foreground/8 bg-background px-4 py-3 text-center"
              >
                <dt className="font-mono text-[10px] tracking-[0.16em] text-foreground/45 uppercase">
                  {stat.label}
                </dt>
                <dd className="mt-1 font-mono text-xl font-bold text-foreground">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mt-7">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/8">
            <span
              className="h-full w-full origin-left rounded-full bg-linear-to-r from-mint via-brand to-astra transition-transform duration-[1600ms] ease-out"
              style={{ transform: `scaleX(${armed ? percent / 100 : 0})` }}
            />
          </div>
          <div aria-hidden className="mt-2 flex justify-between font-mono text-[10px] text-foreground/35">
            <span>GENESIS</span>
            <span>IGNITION</span>
            <span>ORBIT</span>
            <span>CONSTELLATION</span>
          </div>
        </div>
      </section>
    </Reveal>
  );
}

function PhaseRail({ onJump }: { onJump: (id: string) => void }) {
  return (
    <Reveal delay={120}>
      <ol aria-label="Roadmap phases" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROADMAP_PHASES.map((phase, index) => {
          const accent = ACCENT[phase.accent];
          const done = phase.milestones.filter((milestone) => milestone.status === "done").length;
          const ratio = Math.round((done / phase.milestones.length) * 100);
          return (
            <li key={phase.id} className="group relative">
              <button
                type="button"
                onClick={() => onJump(phase.id)}
                className={`relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-surface p-4 text-left transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/5 ${accent.border}`}
              >
                <Corners className={accent.corner} />
                <span className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-xs font-bold tracking-[0.2em] ${accent.text}`}>
                    {phase.index}
                  </span>
                  <PhaseDot status={phase.status} />
                </span>
                <span className="mt-3 block font-pixel text-[10px] tracking-[0.16em] text-foreground/75">
                  {phase.code}
                </span>
                <span className="mt-1 block font-mono text-[10px] text-foreground/40">
                  {phase.label}
                </span>
                <span className="mt-3 block h-1 overflow-hidden rounded-full bg-foreground/8">
                  <span
                    className={`block h-full w-full origin-left rounded-full ${accent.bar} transition-transform duration-1000 ease-out`}
                    style={{ transform: `scaleX(${ratio / 100})` }}
                  />
                </span>
                <span className="mt-2 block font-mono text-[10px] text-foreground/40">
                  {done}/{phase.milestones.length} shipped
                </span>
              </button>
              {index < ROADMAP_PHASES.length - 1 ? (
                <span
                  aria-hidden
                  className="rail-flow absolute top-1/2 -right-3 hidden h-px w-3 text-foreground/25 lg:block"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </Reveal>
  );
}

function MilestoneRow({
  milestone,
  accent,
  delay,
}: {
  milestone: RoadmapMilestone;
  accent: RoadmapAccent;
  delay: number;
}) {
  const meta = STATUS[milestone.status];
  const tones = ACCENT[accent];
  return (
    <li className="relative">
      <span aria-hidden className={`absolute top-7 -left-9 flex size-3 items-center justify-center sm:-left-11`}>
        <span className={`relative size-2 rounded-full ${meta.dot}`} />
      </span>
      <Reveal delay={delay}>
        <article className="group relative overflow-hidden rounded-2xl border border-foreground/8 bg-background p-5 transition-[transform,box-shadow,color,background-color,border-color,fill,stroke] duration-500 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-xl hover:shadow-ink/5">
          <Corners className={tones.corner} />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-linear-to-r from-transparent via-foreground/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:animate-sweep group-hover:opacity-100"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl border font-mono text-[11px] font-bold ${tones.border} ${tones.soft} ${tones.text}`}
              >
                {milestone.period}
              </span>
              <h3 className="text-sm font-bold tracking-tight sm:text-base">{milestone.title}</h3>
            </div>
            <StatusChip status={milestone.status} />
          </div>
          <p className="relative mt-3 text-xs leading-relaxed text-foreground/55 sm:text-[13px]">
            {milestone.description}
          </p>
          {milestone.tags && milestone.tags.length > 0 ? (
            <div className="relative mt-3 flex flex-wrap gap-1.5">
              {milestone.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-foreground/5 px-2 py-1 font-mono text-[10px] text-foreground/45"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      </Reveal>
    </li>
  );
}

function PhaseBlock({
  phase,
  index,
  open,
  onToggle,
}: {
  phase: RoadmapPhase;
  index: number;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const accent = ACCENT[phase.accent];
  const done = phase.milestones.filter((milestone) => milestone.status === "done").length;
  const ratio = Math.round((done / phase.milestones.length) * 100);
  const headerId = `phase-${phase.id}`;
  const panelId = `phase-panel-${phase.id}`;

  return (
    <section id={`phase-${phase.id}`} aria-labelledby={headerId} className="relative scroll-mt-28">
      <Reveal delay={index * 60}>
        <div className={`group relative overflow-hidden rounded-3xl border bg-surface ${accent.border}`}>
          <span aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-50" />
          <span
            aria-hidden
            className={`pointer-events-none absolute -top-20 left-1/3 size-52 rounded-full blur-3xl animate-drift ${accent.bloom}`}
          />
          <Corners className={accent.corner} />

          {/* Full-bleed toggle: keeps the header semantic while the whole card is clickable. */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => onToggle(phase.id)}
            className="absolute inset-0 z-10 cursor-pointer rounded-3xl focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
          >
            <span className="sr-only">
              {open ? "Collapse" : "Expand"} phase {phase.index} — {phase.code}, {phase.label}
            </span>
          </button>

          <div className="relative p-6 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <span
                  className={`flex size-14 shrink-0 items-center justify-center rounded-2xl border font-mono text-xl font-bold ${accent.border} ${accent.soft} ${accent.text}`}
                >
                  {phase.index}
                </span>
                <div className="min-w-0">
                  <p className={`font-pixel text-[10px] tracking-[0.24em] ${accent.text}`}>
                    PHASE {phase.index} · {phase.code}
                  </p>
                  <h2 id={headerId} className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                    {phase.label}
                  </h2>
                  <p className="mt-1 font-mono text-[11px] text-foreground/45">{phase.range}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="w-32">
                  <div className="h-1.5 overflow-hidden rounded-full bg-foreground/8">
                    <span
                      className={`block h-full w-full origin-left rounded-full ${accent.bar} transition-transform duration-1000 ease-out`}
                      style={{ transform: `scaleX(${ratio / 100})` }}
                    />
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-foreground/40">
                    {done}/{phase.milestones.length} shipped
                  </p>
                </div>
                <StatusChip status={phase.status} />
                <span
                  aria-hidden
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full border transition-[color,background-color,border-color,fill,stroke] duration-500 group-hover:bg-foreground/5 ${accent.border} ${accent.text} ${open ? "rotate-180" : ""}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </div>
            </div>
            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-foreground/60">{phase.summary}</p>
          </div>

          {phase.status === "active" ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 animate-scan bg-linear-to-b from-transparent via-brand/10 to-transparent"
            />
          ) : null}
        </div>
      </Reveal>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className="grid transition-[grid-template-rows] duration-500 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden" aria-hidden={!open}>
          <div className="relative pt-4 pl-9 sm:pl-11">
            <span
              aria-hidden
              className={`rail-fade absolute top-10 bottom-6 left-[6px] w-px ${STATUS[phase.status].rail}`}
            />
            <ol className="flex flex-col gap-3">
              {phase.milestones.map((milestone, milestoneIndex) => (
                <MilestoneRow
                  key={`${phase.id}-${milestone.period}-${milestone.title}`}
                  milestone={milestone}
                  accent={phase.accent}
                  delay={milestoneIndex * 70}
                />
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function RoadmapTimeline() {
  // The phase in flight opens by default; everything else stays collapsed so
  // the page leads with what is happening now instead of the full history.
  const [openPhases, setOpenPhases] = useState<Set<string>>(
    () => new Set(ROADMAP_PHASES.filter((phase) => phase.status === "active").map((phase) => phase.id)),
  );

  const allOpen = openPhases.size === ROADMAP_PHASES.length;

  function toggle(id: string) {
    setOpenPhases((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setOpenPhases(allOpen ? new Set() : new Set(ROADMAP_PHASES.map((phase) => phase.id)));
  }

  function jumpTo(id: string) {
    setOpenPhases((current) => new Set(current).add(id));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`phase-${id}`)?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <ProgressConsole />
      <PhaseRail onJump={jumpTo} />

      <div className="flex items-center justify-between gap-3">
        <p className="font-pixel text-[10px] tracking-[0.24em] text-foreground/45">PHASES</p>
        <button
          type="button"
          onClick={toggleAll}
          className="min-h-9 cursor-pointer rounded-full border border-foreground/12 px-4 font-mono text-[11px] font-semibold text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <div className="flex flex-col gap-14">
        {ROADMAP_PHASES.map((phase, index) => (
          <PhaseBlock
            key={phase.id}
            phase={phase}
            index={index}
            open={openPhases.has(phase.id)}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
