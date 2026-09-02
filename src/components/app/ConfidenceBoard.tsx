/**
 * The confidence board: topics dragged between columns, each opening to a deck
 * of its spec points.
 *
 * One component, two modes, deliberately:
 *
 *   "seed" — the first-login pass. Everything is local until the student
 *            commits, because the commit writes a card for every point on the
 *            course and half-finishing it should leave no trace. Opening a topic
 *            here shows what is in it; there is nothing to rate yet.
 *   "live" — the ongoing planner. Every drag and every rating saves as it
 *            happens, so the board is a thing you keep using rather than a gate
 *            you pass through once.
 *
 * The layout is a three-column sort with an unsorted tray above it. The columns
 * are what the student SAID; the ring on each card is what the engine MEASURED.
 * Those are different questions, and the card shows both without inventing a
 * second number for the same one — until a topic has any measured progress the
 * ring falls back to the rating, because then the two genuinely are the same
 * number.
 *
 * There is no reordering inside a column and no controls buried in the card. A
 * column is a set, not a ranking, and every extra affordance on a card is one
 * more thing between the student and the only two decisions here: which column,
 * and how each point inside feels.
 */
import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { GripVertical, Info, Layers, SlidersHorizontal } from "lucide-react";

import { SpecPointSwipeModal } from "@/components/app/SpecPointSwipeModal";
import { masteryFromRow, type ScheduleRow } from "@/lib/fsrs";
import { BANDS, COLUMNS, UNSORTED, bandById, confidenceColor, type BandId } from "@/lib/bands";
import { SUBJECT_LABEL } from "@/lib/session";
import type { SpecPoint, Topic } from "@/lib/study";
import { cn } from "@/lib/utils";

export type BoardProps = {
  topics: Topic[];
  pointsByTopic: Map<string, SpecPoint[]>;
  schedule: Map<string, ScheduleRow>;
  pointConfidence: Map<string, number>;
  /** Band per topic. Controlled by the parent so both modes share this shell. */
  placement: Record<string, BandId>;
  order: Record<BandId, string[]>;
  onMove: (topicId: string, to: BandId) => void;
  /** Absent in seed mode: individual points cannot be rated before any exist. */
  onRatePoint?: (specPointId: string, confidence: number) => void;
  busy?: boolean;
  showSubject?: boolean;
  /**
   * Which rating wins when a point has both its own and one implied by the
   * topic's column — see {@link ringConfidence}. Defaults to the live planner.
   */
  mode?: "seed" | "live";
};

/**
 * The confidence to score a spec point by, given the column its topic sits in
 * and whatever the student has already said about the point itself.
 *
 * The two modes genuinely disagree about which wins, and getting it backwards is
 * visible on screen:
 *
 *   live — the point's own rating wins. A topic drag deliberately leaves points
 *          the student rated individually alone (they carry source 'point'), so
 *          the ring must leave them alone too.
 *   seed — the column wins. Nothing here is committed yet, and committing
 *          rewrites every point under the topic to the column's value. Reading
 *          the stored rating instead meant a re-sorting student dragged a topic
 *          into Confident and watched the ring keep the old number, which looks
 *          exactly like the drag not registering.
 */
function ringConfidence(
  mode: "seed" | "live",
  stated: number | null,
  own: number | undefined,
): number | null {
  return mode === "seed" ? (stated ?? own ?? null) : (own ?? stated);
}

/**
 * Split "Topic 4: Natural selection and genetic modification" into its label and
 * its name, so the card can print the number small and the name big instead of
 * repeating "Topic 4" inside a line that already starts with it. Titles without
 * a colon are left whole — nothing is invented.
 */
function splitTitle(title: string): { eyebrow: string | null; name: string } {
  const at = title.indexOf(":");
  if (at < 0 || at > 24) return { eyebrow: null, name: title };
  return { eyebrow: title.slice(0, at).trim(), name: title.slice(at + 1).trim() };
}

export function ConfidenceBoard({
  topics,
  pointsByTopic,
  schedule,
  pointConfidence,
  placement,
  order,
  onMove,
  onRatePoint,
  busy,
  showSubject = true,
  mode = "live",
}: BoardProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<BandId | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const inBand = useMemo(() => {
    const result: Record<BandId, Topic[]> = { new: [], shaky: [], ok: [], strong: [] };
    for (const band of BANDS) {
      const explicit = order[band.id]
        .map((id) => topics.find((t) => t.id === id))
        .filter(Boolean) as Topic[];
      const rest = topics.filter(
        (t) => (placement[t.id] ?? "new") === band.id && !order[band.id].includes(t.id),
      );
      result[band.id] = [...explicit, ...rest];
    }
    return result;
  }, [topics, placement, order]);

  const drop = (to: BandId) => {
    if (dragging && (placement[dragging] ?? "new") !== to) onMove(dragging, to);
    setDragging(null);
    setOver(null);
  };

  const cardFor = (topic: Topic, band: BandId) => (
    <TopicCard
      key={topic.id}
      topic={topic}
      band={band}
      points={pointsByTopic.get(topic.id) ?? []}
      schedule={schedule}
      pointConfidence={pointConfidence}
      dragging={dragging === topic.id}
      onOpen={() => setOpenId(topic.id)}
      onDragStart={() => setDragging(topic.id)}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
      showSubject={showSubject}
      mode={mode}
    />
  );

  const unsorted = inBand.new;
  const openTopic = topics.find((t) => t.id === openId) ?? null;

  return (
    <div className="space-y-4">
      {/* The tray. Hidden once it is empty — an empty queue is not worth a box. */}
      {unsorted.length > 0 ? (
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setOver("new");
          }}
          onDragLeave={() => setOver((b) => (b === "new" ? null : b))}
          onDrop={() => drop("new")}
          className={cn(
            "rounded-2xl border p-3 transition-colors",
            over === "new" ? "border-primary bg-primary/5" : "border-border/70 bg-muted/30",
          )}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <h3 className="font-display text-sm font-bold tracking-tight">{UNSORTED.label}</h3>
            <span className="text-xs text-muted-foreground">
              Drag each into a column below, or open one to move it
            </span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {unsorted.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unsorted.map((t) => cardFor(t, "new"))}
          </div>
        </section>
      ) : null}

      {/* The three columns, most confident first. */}
      <div className="grid gap-3 md:grid-cols-3">
        {COLUMNS.map((band) => {
          const cards = inBand[band.id];
          return (
            <section
              key={band.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(band.id);
              }}
              onDragLeave={() => setOver((b) => (b === band.id ? null : b))}
              onDrop={() => drop(band.id)}
              className={cn(
                "min-h-40 rounded-2xl border p-3 transition-colors",
                over === band.id
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border/70 bg-muted/20",
              )}
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={cn("size-2.5 shrink-0 rounded-full", band.dot)} aria-hidden />
                <h3 className={cn("font-display text-sm font-bold tracking-tight", band.accent)}>
                  {band.label}
                </h3>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {cards.length}
                </span>
              </div>
              <div className="space-y-2">
                {cards.map((t) => cardFor(t, band.id))}
                {cards.length === 0 ? (
                  <p className="px-1 py-5 text-center text-xs text-muted-foreground/70">
                    Drop topics here
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        The column is what you said; the ring is how well it is actually sticking. Come back and
        re-sort whenever — it reshapes your plan straight away.
      </p>

      <AnimatePresence>
        {openTopic ? (
          <SpecPointSwipeModal
            key={openTopic.id}
            topicTitle={splitTitle(openTopic.title).name}
            topicCode={splitTitle(openTopic.title).eyebrow}
            points={pointsByTopic.get(openTopic.id) ?? []}
            pointConfidence={pointConfidence}
            band={placement[openTopic.id] ?? "new"}
            onMove={(to) => onMove(openTopic.id, to)}
            onRatePoint={onRatePoint}
            onClose={() => setOpenId(null)}
            busy={busy}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TopicCard({
  topic,
  band,
  points,
  schedule,
  pointConfidence,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  showSubject,
  mode,
}: {
  topic: Topic;
  band: BandId;
  points: SpecPoint[];
  schedule: Map<string, ScheduleRow>;
  pointConfidence: Map<string, number>;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  showSubject: boolean;
  mode: "seed" | "live";
}) {
  const { eyebrow, name } = splitTitle(topic.title);

  // The rating the topic's own band implies, used as each point's confidence
  // when the student has not rated that point individually — which is exactly
  // what dragging the topic writes to those points anyway. In seed mode there
  // are no cards yet, so this alone drives the ring: drop a topic in Confident
  // and it turns green immediately, which is the feedback that makes the sort
  // feel like it did something.
  const stated = band === "new" ? null : bandById(band).confidence;
  const mastery = points.length
    ? Math.round(
        points.reduce(
          (s, sp) =>
            s +
            masteryFromRow(
              schedule.get(sp.id),
              ringConfidence(mode, stated, pointConfidence.get(sp.id)),
            ),
          0,
        ) / points.length,
      )
    : (stated ?? 0);
  const rated = stated != null || points.some((sp) => schedule.has(sp.id));

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag without payload on the event.
        e.dataTransfer.setData("text/plain", topic.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group surface-soft flex cursor-grab items-center gap-2.5 rounded-xl border px-3 py-2.5 transition select-none active:cursor-grabbing",
        dragging ? "border-primary opacity-40" : "border-transparent hover:border-primary/40",
      )}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
      <ConfidenceRing value={mastery} rated={rated} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        {eyebrow ? (
          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </span>
        ) : null}
        <span className="block text-sm font-medium leading-snug">{name}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {showSubject ? `${SUBJECT_LABEL[topic.subject]} · ` : ""}
          {points.length} point{points.length === 1 ? "" : "s"}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${topic.title}`}
        title="Rate specification points"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground opacity-60 transition hover:bg-card hover:text-foreground group-hover:opacity-100"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
      </button>
    </article>
  );
}

/**
 * The number on the card. Grey and dashed until there is anything to say, so an
 * unrated topic never pretends to a score of zero.
 */
function ConfidenceRing({ value, rated }: { value: number; rated: boolean }) {
  const size = 34;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = rated ? confidenceColor(value) : "#cbd5e1"; // slate-300 when unrated
  const dash = rated ? (value / 100) * c : c;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 0.3s ease, stroke 0.3s ease" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums"
        style={{ color: rated ? color : "#94a3b8" }}
      >
        {rated ? value : "–"}
      </span>
    </div>
  );
}
