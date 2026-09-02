import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { BAND_CLASS, BAND_LABEL, masteryBand } from "@/lib/fsrs";

/** Page heading used by every signed-in screen, so they all start the same way. */
export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

/**
 * The empty state.
 *
 * Used heavily right now: the curriculum tables are not seeded yet, so most
 * screens legitimately have nothing to show. An empty state that explains WHY
 * and what to do next is the difference between "not built" and "not filled in".
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="premium-card rounded-2xl p-8 text-center">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action ? (
        <Link
          to={action.to as never}
          className="btn-soft mt-5 inline-flex rounded-xl px-4 py-2 text-sm"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      {label}…
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      {message}
    </div>
  );
}

/** Mastery pill. One component so the bands never drift between screens. */
export function MasteryPill({ mastery, hasCard }: { mastery: number; hasCard: boolean }) {
  const band = masteryBand(mastery, hasCard);
  return (
    <span className={cn("chip shrink-0 text-xs", BAND_CLASS[band])}>
      {BAND_LABEL[band]}
      {hasCard ? ` · ${mastery}%` : ""}
    </span>
  );
}

/** Thin progress bar, used for topic and course roll-ups. */
export function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="premium-card rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-display mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
