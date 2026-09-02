/**
 * Curriculum authoring.
 *
 * The hub's curriculum tables are empty until they're seeded, and this is the
 * screen that fills the gaps — or authors a course outright. Spec points are
 * never invented: codes and titles come from the board's own specification.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { BOARD_LABEL, LEVEL_LABEL, SUBJECT_LABEL } from "@/lib/session";
import {
  useAllTopics,
  useCreateSpecPoint,
  useCreateTopic,
  useDeleteSpecPoint,
  useSpecPointsFor,
} from "@/lib/tutor";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tutor/curriculum")({ component: TutorCurriculum });

const SUBJECTS: Database["public"]["Enums"]["subject"][] = ["biology", "chemistry", "physics"];
const BOARDS: Database["public"]["Enums"]["board"][] = ["aqa", "ocr", "edexcel"];
const LEVELS: Database["public"]["Enums"]["level"][] = ["gcse", "igcse", "alevel"];

function TutorCurriculum() {
  const topicsQ = useAllTopics();
  const createTopic = useCreateTopic();
  const [selected, setSelected] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    subject: "biology" as Database["public"]["Enums"]["subject"],
    board: "aqa" as Database["public"]["Enums"]["board"],
    level: "gcse" as Database["public"]["Enums"]["level"],
  });

  if (topicsQ.isLoading) return <Spinner label="Loading curriculum" />;
  if (topicsQ.error) return <ErrorNote error={topicsQ.error} />;

  const topics = topicsQ.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Tutor" title="Curriculum" />

      <section className="premium-card space-y-3 rounded-2xl p-5">
        <h2 className="font-display text-base font-bold tracking-tight">Add a topic</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Topic title, e.g. Cell biology"
            className="premium-input h-10 rounded-xl px-3 text-sm sm:col-span-2"
          />
          <select
            value={form.subject}
            onChange={(e) =>
              setForm((f) => ({ ...f, subject: e.target.value as typeof f.subject }))
            }
            className="premium-input h-10 rounded-xl px-3 text-sm"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {SUBJECT_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={form.board}
            onChange={(e) => setForm((f) => ({ ...f, board: e.target.value as typeof f.board }))}
            className="premium-input h-10 rounded-xl px-3 text-sm"
          >
            {BOARDS.map((b) => (
              <option key={b} value={b}>
                {BOARD_LABEL[b]}
              </option>
            ))}
          </select>
          <select
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as typeof f.level }))}
            className="premium-input h-10 rounded-xl px-3 text-sm"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!form.title.trim() || createTopic.isPending}
            onClick={() =>
              createTopic.mutate(
                { ...form, title: form.title.trim(), sort_order: topics.length },
                {
                  onSuccess: () => {
                    setForm((f) => ({ ...f, title: "" }));
                    toast.success("Topic added");
                  },
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                },
              )
            }
            className="btn-premium h-10 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
          >
            Add topic
          </button>
        </div>
      </section>

      {topics.length === 0 ? (
        <EmptyState
          title="No topics yet"
          body="Add a topic above, or load the curriculum in bulk with a seed script — authoring a full specification by hand here would take a very long time."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
          <ul className="space-y-1">
            {topics.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    selected === t.id ? "bg-card font-semibold" : "hover:bg-card/60",
                  )}
                >
                  <span className="block truncate">{t.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {SUBJECT_LABEL[t.subject]} · {BOARD_LABEL[t.board]} · {LEVEL_LABEL[t.level]}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <SpecPointEditor topicId={selected} />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a topic to edit its spec points.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SpecPointEditor({ topicId }: { topicId: string }) {
  const pointsQ = useSpecPointsFor(topicId);
  const create = useCreateSpecPoint();
  const remove = useDeleteSpecPoint();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [weight, setWeight] = useState("1");

  const points = pointsQ.data ?? [];

  return (
    <div className="premium-card space-y-3 rounded-2xl p-4">
      <h3 className="font-display text-sm font-bold tracking-tight">
        Spec points ({points.length})
      </h3>

      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_5rem_auto]">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="4.1.2"
          className="premium-input h-10 rounded-xl px-3 text-sm"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Spec point title, exactly as the board words it"
          className="premium-input h-10 rounded-xl px-3 text-sm"
        />
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          inputMode="decimal"
          placeholder="1"
          title="How much of a week's work this point represents"
          className="premium-input h-10 rounded-xl px-3 text-sm"
        />
        <button
          type="button"
          disabled={!code.trim() || !title.trim() || create.isPending}
          onClick={() =>
            create.mutate(
              {
                topic_id: topicId,
                code: code.trim(),
                title: title.trim(),
                weight: Number(weight) || 1,
                sort_order: points.length,
              },
              {
                onSuccess: () => {
                  setCode("");
                  setTitle("");
                  toast.success("Spec point added");
                },
                onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
              },
            )
          }
          className="btn-premium h-10 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {pointsQ.isLoading ? <Spinner label="Loading points" /> : null}

      <ul className="space-y-1">
        {points.map((sp) => (
          <li
            key={sp.id}
            className="surface-soft flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
          >
            <span className="font-mono text-xs text-muted-foreground">{sp.code}</span>
            <span className="min-w-0 flex-1 truncate">{sp.title}</span>
            <button
              type="button"
              onClick={() =>
                remove.mutate(sp.id, {
                  onSuccess: () => toast.success("Removed"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                })
              }
              aria-label={`Delete ${sp.code}`}
              className="btn-soft rounded-lg p-1.5"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
