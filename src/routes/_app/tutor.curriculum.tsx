/**
 * Curriculum authoring.
 *
 * The hub's curriculum tables are empty until they're seeded, and this is the
 * screen that fills the gaps — or authors a course outright. Spec points are
 * never invented: codes and titles come from the board's own specification.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorNote,
  PageHeader,
  SectionHeading,
  Spinner,
} from "@/components/app/Shared";
import { subjectTint } from "@/lib/subject";
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
      <PageHeader
        eyebrow="Tutor"
        title="Curriculum"
        icon={BookOpen}
        lede="Fill the gaps in a seeded spec, or author a course outright. Never invent a spec point — codes and titles come from the board."
      />

      <section className="pop-card space-y-3 p-5">
        <SectionHeading title="Add a topic" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Topic title, e.g. Cell biology"
            className="premium-input h-11 rounded-xl px-3.5 text-sm font-medium sm:col-span-2"
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
            className="btn-hero h-11 rounded-xl px-5 text-sm disabled:opacity-50"
          >
            Add topic
          </button>
        </div>
      </section>

      {topics.length === 0 ? (
        <EmptyState
          mascot="books"
          title="No topics yet"
          body="Add a topic above, or load the curriculum in bulk with a seed script — authoring a full specification by hand here would take a very long time."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
          <ul className="scroll-slim max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {topics.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    subjectTint(t.subject),
                    "w-full px-3.5 py-2.5 text-left text-sm",
                    selected === t.id
                      ? "pop-card"
                      : "pop-card pop-card-flat opacity-70 hover:opacity-100",
                  )}
                >
                  <span className="font-display block truncate font-extrabold">{t.title}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                    {SUBJECT_LABEL[t.subject]} · {BOARD_LABEL[t.board]} · {LEVEL_LABEL[t.level]}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <SpecPointEditor topicId={selected} />
          ) : (
            <p className="surface-soft p-5 text-sm font-semibold text-muted-foreground">
              Pick a topic to edit its spec points.
            </p>
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
    <div className="pop-card space-y-3 p-4 sm:p-5">
      <SectionHeading title="Spec points" hint={`${points.length} in this topic`} />

      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_5rem_auto]">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="4.1.2"
          className="premium-input h-11 rounded-xl px-3 text-sm font-semibold"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Spec point title, exactly as the board words it"
          className="premium-input h-11 rounded-xl px-3 text-sm font-medium"
        />
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          inputMode="decimal"
          placeholder="1"
          title="How much of a week's work this point represents"
          className="premium-input h-11 rounded-xl px-3 text-sm font-semibold"
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
          className="btn-hero h-11 rounded-xl px-5 text-sm disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {pointsQ.isLoading ? <Spinner label="Loading points" /> : null}

      <ul className="scroll-slim max-h-[26rem] space-y-2 overflow-y-auto pr-1">
        {points.map((sp) => (
          <li key={sp.id} className="surface-soft flex items-center gap-2.5 px-3 py-2.5 text-sm">
            <span className="numeral shrink-0 rounded-md bg-[color:color-mix(in_oklab,var(--tint)_12%,transparent)] px-1.5 py-0.5 text-[10px] text-[color:var(--tint)]">
              {sp.code}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{sp.title}</span>
            <button
              type="button"
              onClick={() =>
                remove.mutate(sp.id, {
                  onSuccess: () => toast.success("Removed"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                })
              }
              aria-label={`Delete ${sp.code}`}
              className="tint-rose btn-soft rounded-lg p-2"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
