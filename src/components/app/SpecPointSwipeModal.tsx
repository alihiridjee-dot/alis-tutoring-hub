/**
 * Rating a topic's spec points, one card at a time.
 *
 * The board's columns are a broad statement about a topic; these are the fine
 * one underneath it. Each rating is persisted at its raw band value — never
 * averaged with the column, and it never moves the topic between columns — and
 * fed to FSRS as a confidence review, so a single weak point inside an
 * otherwise-confident topic still resurfaces on its own.
 *
 * A deck rather than a list because a list of two hundred statements with three
 * buttons each is a page nobody finishes. One card, one decision, three ways to
 * make it: drag, click, or the arrow keys. Nothing is written until the last
 * card, which is what makes Back honest — it can un-decide because there is
 * nothing to un-write.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { Check, Loader2, Undo2, X } from "lucide-react";

import { BANDS, COLUMNS, bandById, type BandId } from "@/lib/bands";
import { Confetti, Mascot } from "@/components/app/Doodles";
import type { SpecPoint } from "@/lib/study";
import { cn } from "@/lib/utils";

/** Horizontal drag, in px, that commits a decision. */
const SWIPE_THRESHOLD = 110;

/** The deck's three choices, weakest first — the order the buttons read in. */
const DECK_BANDS: BandId[] = ["shaky", "ok", "strong"];

export function SpecPointSwipeModal({
  topicTitle,
  topicCode,
  points,
  pointConfidence,
  band,
  onMove,
  onRatePoint,
  onClose,
  busy,
}: {
  topicTitle: string;
  topicCode: string | null;
  points: SpecPoint[];
  pointConfidence: Map<string, number>;
  /** The band the topic sits in now. */
  band: BandId;
  onMove: (to: BandId) => void;
  /**
   * Absent in seed mode: there is nothing to rate before the sort is committed,
   * so the modal is just the topic's contents and a way to move it.
   */
  onRatePoint?: (specPointId: string, confidence: number) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, BandId>>({});
  const [saving, setSaving] = useState(false);

  const total = points.length;
  const canRate = Boolean(onRatePoint) && total > 0;
  const done = canRate && Object.keys(choices).length >= total;

  const finish = async (final: Record<string, BandId>) => {
    if (!onRatePoint) return;
    setSaving(true);
    for (const p of points) {
      const choice = final[p.id];
      if (!choice) continue;
      onRatePoint(p.id, bandById(choice).confidence);
    }
    setSaving(false);
  };

  const choose = (choice: BandId) => {
    const p = points[index];
    if (!p) return;
    const next = { ...choices, [p.id]: choice };
    setChoices(next);
    if (index + 1 >= total) void finish(next);
    else setIndex((i) => i + 1);
  };

  // Arrow keys drive the deck: ← needs work, ↓ getting there, → confident.
  useEffect(() => {
    if (!canRate || done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      const pick =
        e.key === "ArrowRight"
          ? "strong"
          : e.key === "ArrowLeft"
            ? "shaky"
            : e.key === "ArrowDown"
              ? "ok"
              : null;
      if (!pick) return;
      e.preventDefault();
      choose(pick as BandId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const undo = () => {
    if (index === 0) return;
    const prev = points[index - 1];
    setChoices((c) => {
      const n = { ...c };
      delete n[prev.id];
      return n;
    });
    setIndex((i) => i - 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Rate ${topicTitle}`}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="pop-card pop-card-hero relative flex w-full flex-col rounded-t-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b-2 border-dashed border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] p-5">
          <div className="min-w-0">
            {topicCode ? <p className="eyebrow">{topicCode}</p> : null}
            <h2 className="font-display mt-1.5 text-xl font-extrabold leading-tight">
              {topicTitle}
            </h2>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {canRate
                ? "Rate each point: needs work, getting there, or confident."
                : `${total} spec point${total === 1 ? "" : "s"} in this topic.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex size-9 shrink-0 items-center justify-center rounded-xl"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* The one thing Anglian's modal has no equivalent of. Dragging is the
            only way to move a topic there, and drag-and-drop cannot be done with
            a keyboard — on a screen every student is forced through at first
            login, that is not a corner to cut.

            A SELECT, not a row of band buttons. Buttons put "Confident" twice in
            one dialog — once for the whole topic, once for the point on screen —
            doing completely different things. I mis-clicked it myself within a
            minute of building it. One labelled control cannot be confused with
            the deck's, and it takes a third of the width. */}
        <div
          className={cn(
            bandById(band).tint,
            "flex items-center gap-2.5 border-b-2 border-dashed border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] px-5 py-3",
          )}
        >
          <label
            htmlFor="topic-band"
            className="font-display text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground"
          >
            This whole topic
          </label>
          <select
            id="topic-band"
            value={band}
            disabled={busy}
            onChange={(e) => onMove(e.target.value as BandId)}
            className="premium-input h-9 rounded-lg px-2.5 text-xs font-bold"
          >
            {BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        <div className="p-5">
          {total === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No specification points for this topic yet.
            </p>
          ) : !canRate ? (
            <ul className="scroll-slim max-h-64 space-y-2 overflow-y-auto pr-1">
              {points.map((p) => (
                <li
                  key={p.id}
                  className="surface-soft flex items-start gap-2.5 px-3 py-2 text-xs leading-relaxed"
                >
                  <span className="numeral shrink-0 text-[10px] text-[color:var(--tint)]">
                    {p.code}
                  </span>
                  <span className="font-medium">{p.title}</span>
                </li>
              ))}
            </ul>
          ) : done ? (
            <div className="py-12 text-center">
              {saving ? (
                <>
                  <Loader2
                    className="mx-auto size-6 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                  <p className="mt-3 text-sm text-muted-foreground">Saving your ratings…</p>
                </>
              ) : (
                <div className="relative">
                  <Confetti />
                  <Mascot
                    name="star"
                    mood="proud"
                    size={96}
                    idle={false}
                    className="mx-auto cheer"
                  />
                  <span className="sticker stamp-in mt-3 inline-flex">
                    <Check className="size-3.5" aria-hidden />
                    Topic rated
                  </span>
                  <p className="mt-3 text-sm font-semibold">All done — nice work.</p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn-soft mt-5 rounded-xl px-5 py-2.5 text-xs"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          ) : (
            <SwipeDeck
              points={points}
              index={index}
              previous={pointConfidence.get(points[index]?.id ?? "")}
              onChoose={choose}
            />
          )}
        </div>

        {canRate && !done ? (
          <div className="space-y-3 border-t-2 border-dashed border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] p-4">
            {/* A segmented bar, one cell per point, so the deck shows how much is
                left without a second line of text saying so. */}
            <div className="flex items-center gap-3">
              <span aria-hidden className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full">
                {points.map((p, i) => (
                  <span
                    key={p.id}
                    className={cn(
                      "h-full flex-1 rounded-full transition-colors",
                      i < index
                        ? "bg-[color:var(--primary)]"
                        : "bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)]",
                    )}
                  />
                ))}
              </span>
              <span className="numeral shrink-0 text-xs text-muted-foreground">
                {Math.min(index + 1, total)} / {total}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={undo}
                disabled={index === 0}
                className="btn-ghost inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm disabled:opacity-40"
              >
                <Undo2 className="size-4" aria-hidden /> Back
              </button>
              <div className="flex items-center gap-2">
                {DECK_BANDS.map((id) => (
                  <RatingButton key={id} band={id} onClick={() => choose(id)} />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

/** One choice button, coloured from its band. */
function RatingButton({ band, onClick }: { band: BandId; onClick: () => void }) {
  const meta = bandById(band);
  return (
    <button
      type="button"
      onClick={onClick}
      title={meta.hint}
      className={cn(
        meta.tint,
        "btn-soft inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px]",
      )}
    >
      <span className="size-2.5 rounded-full bg-[color:var(--tint)]" aria-hidden />
      {meta.label}
    </button>
  );
}

/**
 * The card stack: the top card, and a hint of the next one behind it.
 *
 * Written as two explicit cards rather than a mapped, reversed slice with a
 * `depth` index. That version put the peek card's scale and 0.6 opacity onto the
 * TOP card — both rendered faded and shrunk, so the two texts showed through
 * each other and the card you were meant to be reading was the greyer of the
 * two. There is no arithmetic to get wrong here now: the peek is a static div
 * that never moves, and the swipeable card is always full size and opaque.
 */
function SwipeDeck({
  points,
  index,
  previous,
  onChoose,
}: {
  points: SpecPoint[];
  index: number;
  previous: number | undefined;
  onChoose: (choice: BandId) => void;
}) {
  const top = points[index];
  const next = points[index + 1];

  return (
    <div className="relative h-60">
      {next ? (
        <div
          aria-hidden
          className="pop-card pop-card-flat absolute inset-0 origin-top translate-y-3 scale-95 opacity-70"
        />
      ) : null}
      <AnimatePresence initial={false}>
        {top ? (
          <SwipeCard key={top.id} point={top} previous={previous} onChoose={onChoose} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SwipeCard({
  point,
  previous,
  onChoose,
}: {
  point: SpecPoint;
  previous: number | undefined;
  onChoose: (choice: BandId) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const strongOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const shakyOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);

  return (
    <motion.div
      className="absolute inset-0"
      style={{ x, rotate }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={(_, info) => {
        // Drag is a shortcut for the two extremes; the middle button covers amber.
        if (info.offset.x > SWIPE_THRESHOLD) onChoose("strong");
        else if (info.offset.x < -SWIPE_THRESHOLD) onChoose("shaky");
      }}
      whileTap={{ cursor: "grabbing" }}
    >
      <div className="pop-card pop-card-hero flex h-full w-full cursor-grab select-none flex-col p-5 active:cursor-grabbing">
        <span className="numeral w-fit rounded-md bg-[color:color-mix(in_oklab,var(--tint)_12%,transparent)] px-2 py-0.5 text-[11px] text-[color:var(--tint)]">
          {point.code}
        </span>
        <p className="font-display scroll-slim mt-3 flex-1 overflow-y-auto text-lg font-extrabold leading-snug">
          {point.title}
        </p>
        <p className="mt-3 shrink-0 text-[11px] font-medium text-muted-foreground">
          {previous != null
            ? `You said ${bandById(bandOfConfidence(previous)).label} last time. `
            : ""}
          Drag left or right, or use the buttons below.
        </p>
      </div>

      {/* The swipe stamps. Same sticker vocabulary as a milestone badge, because
          that is exactly what committing a card is. */}
      <motion.div
        style={{ opacity: strongOpacity }}
        className="tint-emerald sticker sticker-alt absolute right-5 top-5 rotate-12"
      >
        {COLUMNS[0].label}
      </motion.div>
      <motion.div
        style={{ opacity: shakyOpacity }}
        className="tint-rose sticker sticker-alt absolute left-5 top-5 -rotate-12"
      >
        {COLUMNS[2].label}
      </motion.div>
    </motion.div>
  );
}

/** Nearest band for a stored confidence, for the "you said X last time" hint. */
function bandOfConfidence(confidence: number): BandId {
  let best: BandId = "new";
  for (const b of BANDS) if (confidence >= b.confidence) best = b.id;
  return best;
}
