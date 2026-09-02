/**
 * How the focus lane describes itself — the words and the colours, kept apart
 * from the components in {@link ./FocusLane} that render them.
 *
 * Split out because a module exporting both constants and components breaks
 * fast refresh: editing a colour would reload the whole tree instead of
 * swapping the component.
 */
import { Repeat, Sparkles } from "lucide-react";

import { FOCUS_RED_BELOW, type FocusBand } from "@/lib/pacing";

/** What a student is told "focused topics" means, on hover. */
export const FOCUSED_TOPICS_BLURB =
  "Topics we bring back round. When a confidence rating or a piece of homework says something hasn't stuck, it's scheduled again just before you'd forget it — and it keeps coming back until it does.";

export type FocusTone = "needsWork" | "revisit" | "refresh";

/**
 * The three reasons a topic comes back, as colour.
 *
 * Each row is shaded rather than chipped, so a week reads at a glance — a run of
 * red is a student in trouble, a run of green is one coasting to the exams, and
 * you can tell which without reading a word. The ICON carries the same
 * distinction as the colour, because a plan that speaks only in red and green
 * excludes the students most likely to be colour-blind from reading it, and the
 * key names all three in words.
 */
export const FOCUS_TONES: Record<
  FocusTone,
  {
    label: string;
    icon: typeof Repeat;
    row: string;
    swatch: string;
    icons: string;
    meaning: string;
  }
> = {
  needsWork: {
    label: "Needs work",
    icon: Repeat,
    row: "bg-rose-500/10 border-l-rose-500 hover:bg-rose-500/[0.16]",
    swatch: "bg-rose-500/[0.14] border-rose-500/30 border-l-rose-500",
    icons: "text-rose-600 dark:text-rose-400",
    meaning: "A long way from sticking — comes back most often.",
  },
  revisit: {
    label: "Revisit",
    icon: Repeat,
    row: "bg-amber-500/10 border-l-amber-500 hover:bg-amber-500/[0.16]",
    swatch: "bg-amber-500/[0.14] border-amber-500/30 border-l-amber-500",
    icons: "text-amber-600 dark:text-amber-400",
    meaning: "Getting there — due a spaced review.",
  },
  refresh: {
    label: "Quick refresh",
    icon: Sparkles,
    row: "bg-emerald-500/[0.09] border-l-emerald-500 hover:bg-emerald-500/[0.15]",
    swatch: "bg-emerald-500/[0.13] border-emerald-500/30 border-l-emerald-500",
    icons: "text-emerald-600 dark:text-emerald-400",
    meaning: "Already covered — a light look before the exams.",
  },
};

/** Worst first, so the key reads as a scale. */
export const FOCUS_TONE_ORDER: FocusTone[] = ["needsWork", "revisit", "refresh"];

export function toneOf(band: FocusBand): FocusTone {
  if (band.kind !== "revisit") return "refresh";
  return band.mastery < FOCUS_RED_BELOW ? "needsWork" : "revisit";
}

/** Why this band is here, in plain English — shown on hover. */
export function toneWhy(band: FocusBand): string {
  const tone = toneOf(band);
  const pct = Math.round(band.mastery);
  if (tone === "refresh") return "Already covered — a light review before the exams.";
  if (tone === "needsWork") return `Low mastery (${pct}%) — this comes back often until it sticks.`;
  return `Getting there (${pct}%) — due a spaced review so it doesn't slip.`;
}
