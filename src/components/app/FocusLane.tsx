/**
 * The focus lane of the full-plan grid — the column of topics the memory engine
 * keeps bringing back.
 *
 * The anatomy deliberately mirrors the core column: a topic you can open to see
 * the spec points underneath it. Core and focused are the same kind of thing —
 * work with a name and a list of points — differing only in *why* they are on
 * the list, so they should not ask to be read two different ways.
 *
 * The words and colours live in {@link ./focusMeta}.
 */
import { ChevronDown, HelpCircle, Repeat } from "lucide-react";

import {
  FOCUSED_TOPICS_BLURB,
  FOCUS_TONES,
  FOCUS_TONE_ORDER,
  toneOf,
  toneWhy,
} from "@/components/app/focusMeta";
import { type FocusBand } from "@/lib/pacing";
import { cn } from "@/lib/utils";

/**
 * The colour key, so the shading means something.
 *
 * Sits ABOVE the grid, not under it: a key you meet after reading the rows has
 * arrived too late to be a key. The sentence behind each swatch waits on hover
 * rather than taking a line of the page — spelling all three out in full turns a
 * legend into a paragraph, which is the opposite of what a legend is for.
 */
export function FocusKey() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {FOCUS_TONE_ORDER.map((name) => {
        const tone = FOCUS_TONES[name];
        return (
          <span
            key={name}
            className="inline-flex cursor-help items-center gap-1.5"
            title={tone.meaning}
          >
            <span className={cn("size-3.5 rounded-sm border border-l-[3px]", tone.swatch)} />
            {tone.label}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The "Focused topics" heading, with the explanation a hover away.
 *
 * The whole plan hinges on the student understanding why a topic they already
 * covered is sitting on next week's row. The legend above says it once, but the
 * header is where they are looking at the moment they wonder.
 *
 * The blurb hangs off the ICON alone: a tooltip firing whenever the pointer
 * crossed the column title would cover the first row of the grid every time
 * they went to click something in it.
 */
export function FocusedTopicsLabel({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Repeat className="size-3.5 shrink-0 text-rose-500" aria-hidden />
      Focused topics
      <span
        className="group/help relative inline-flex shrink-0 cursor-help"
        tabIndex={0}
        aria-label="What are focused topics?"
      >
        <HelpCircle className="size-3 opacity-60" aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 w-64 rounded-lg border border-border bg-popover p-2.5 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-muted-foreground opacity-0 shadow-lg transition-opacity group-hover/help:opacity-100 group-focus/help:opacity-100"
        >
          {FOCUSED_TOPICS_BLURB}
        </span>
      </span>
    </span>
  );
}

/**
 * One focused topic in a week's cell, shaded by why it came back.
 *
 * The reason used to ride in a text chip beside the title, which pushed the
 * topic itself into an ellipsis in a column this narrow and made every row look
 * equally urgent. As shading it costs no width, and a week's worth can be read
 * as a block.
 */
export function FocusTopicRow({
  band,
  open,
  onToggle,
}: {
  band: FocusBand;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = FOCUS_TONES[toneOf(band)];
  const Icon = tone.icon;
  const hasDetail = band.points.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasDetail && onToggle()}
        aria-expanded={hasDetail ? open : undefined}
        title={toneWhy(band)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border-l-[3px] px-2.5 py-1.5 text-left transition-colors",
          tone.row,
          !hasDetail && "cursor-default",
        )}
      >
        <Icon className={cn("size-3.5 shrink-0", tone.icons)} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px]">{band.title}</span>
        {hasDetail ? (
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        ) : null}
      </button>
      {open && hasDetail ? (
        <ul className="mt-1 space-y-0.5 pl-7 pr-2">
          {band.points.map((p) => (
            <li key={p.specPointId} className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-mono">{p.code}</span> {p.title}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
