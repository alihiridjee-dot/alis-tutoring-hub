/**
 * Messages. The same screen for both sides — RLS decides whose threads appear,
 * so the tutor sees every student and a student sees only themselves.
 */
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { useViewer } from "@/lib/session";
import { useMessages, useSendMessage, useStartThread, useThreads } from "@/lib/chat";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/messages")({ component: MessagesPage });

function MessagesPage() {
  const viewer = useViewer();
  const threadsQ = useThreads();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const startThread = useStartThread();
  const send = useSendMessage();

  const threads = threadsQ.data ?? [];
  const active = threads.find((t) => t.id === activeId) ?? threads[0];
  const messagesQ = useMessages(active?.id);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messagesQ.data]);

  if (threadsQ.isLoading) return <Spinner label="Loading messages" />;
  if (threadsQ.error) return <ErrorNote error={threadsQ.error} />;

  const canStart = !viewer.isTutor && viewer.user;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Messages" title={viewer.isTutor ? "Student questions" : "Ask Ali"} />

      {threads.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="No messages yet"
            body={
              viewer.isTutor
                ? "When a student asks a question it lands here, attached to the spec point or homework it's about."
                : "Stuck on something? Start a thread and Ali will pick it up."
            }
          />
          {canStart ? (
            <NewThread
              onSend={(body) =>
                startThread.mutate(
                  { studentId: viewer.user!.id, senderId: viewer.user!.id, subject: "", body },
                  {
                    onSuccess: () => toast.success("Sent"),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send"),
                  },
                )
              }
              pending={startThread.isPending}
            />
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
          <ul className="space-y-1.5">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                    active?.id === t.id ? "bg-card font-semibold" : "hover:bg-card/60",
                  )}
                >
                  <p className="truncate text-sm">
                    {viewer.isTutor ? t.studentName : t.specPointLabel || "General"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.lastMessage ?? "No messages"}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="premium-card flex min-h-[24rem] flex-col rounded-2xl">
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {(messagesQ.data ?? []).map((m) => {
                const mine = m.sender_id === viewer.user?.id;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                      mine ? "ml-auto bg-primary text-primary-foreground" : "surface-soft mr-auto",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                );
              })}
            </div>

            <form
              className="flex items-center gap-2 border-t border-border/70 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim() || !active || !viewer.user) return;
                send.mutate(
                  { threadId: active.id, senderId: viewer.user.id, body: draft.trim() },
                  {
                    onSuccess: () => setDraft(""),
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : "Could not send"),
                  },
                );
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message"
                className="premium-input h-10 flex-1 rounded-xl px-3 text-sm"
              />
              <button
                type="submit"
                disabled={send.isPending || !draft.trim()}
                className="btn-premium rounded-xl p-2.5 disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function NewThread({ onSend, pending }: { onSend: (body: string) => void; pending: boolean }) {
  const [body, setBody] = useState("");
  return (
    <form
      className="premium-card space-y-3 rounded-2xl p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        onSend(body.trim());
        setBody("");
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="What's the question?"
        className="premium-input w-full rounded-xl p-3 text-sm"
      />
      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="btn-premium rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send to Ali"}
      </button>
    </form>
  );
}
