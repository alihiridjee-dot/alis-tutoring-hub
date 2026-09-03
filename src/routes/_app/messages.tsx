/**
 * Messages. The same screen for both sides — RLS decides whose threads appear,
 * so the tutor sees every student and a student sees only themselves.
 */
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { Mascot } from "@/components/app/Doodles";
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
      <PageHeader
        eyebrow="Messages"
        title={viewer.isTutor ? "Student questions" : "Ask Ali"}
        icon={MessageSquare}
        lede={
          viewer.isTutor
            ? "Every thread your students have started, newest activity first."
            : "Stuck on something? Ask here and Ali picks it up between lessons."
        }
      />

      {threads.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            mascot="flask"
            mood="happy"
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
          <ul className="scroll-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:scroll-slim md:mx-0 md:max-h-[28rem] md:flex-col md:overflow-y-auto md:px-0">
            {threads.map((t) => {
              const on = active?.id === t.id;
              return (
                <li key={t.id} className="w-56 shrink-0 md:w-auto">
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className={cn(
                      "w-full px-3.5 py-3 text-left",
                      on ? "pop-card" : "pop-card pop-card-flat opacity-70 hover:opacity-100",
                    )}
                  >
                    <p className="font-display truncate text-sm font-extrabold">
                      {viewer.isTutor ? t.studentName : t.specPointLabel || "General"}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                      {t.lastMessage ?? "No messages"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="pop-card flex min-h-[26rem] flex-col">
            <div
              ref={scrollRef}
              className="scroll-slim flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-5"
            >
              {(messagesQ.data ?? []).length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                  <Mascot name="flask" mood="happy" size={72} />
                  <p className="text-sm font-semibold text-muted-foreground">
                    Nothing here yet — say hello.
                  </p>
                </div>
              ) : null}
              {(messagesQ.data ?? []).map((m) => {
                const mine = m.sender_id === viewer.user?.id;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[82%] border-[1.5px] px-4 py-2.5 text-sm font-medium leading-relaxed",
                      mine
                        ? "ml-auto rounded-2xl rounded-br-md border-[color:color-mix(in_oklab,var(--primary)_60%,black)] bg-[color:var(--primary)] text-white"
                        : "mr-auto rounded-2xl rounded-bl-md border-[color:var(--edge)] bg-[color:color-mix(in_oklab,var(--tint)_6%,var(--card))]",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                );
              })}
            </div>

            <form
              className="flex items-center gap-2 border-t-2 border-dashed border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] p-3"
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
                className="premium-input h-11 flex-1 rounded-xl px-3.5 text-sm font-medium"
              />
              <button
                type="submit"
                disabled={send.isPending || !draft.trim()}
                className="btn-hero rounded-xl p-3 disabled:opacity-50"
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
      className="pop-card space-y-3 p-4 sm:p-5"
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
        className="premium-input w-full rounded-xl p-3.5 text-sm font-medium"
      />
      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="btn-hero rounded-xl px-5 py-2.5 text-sm disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send to Ali"}
      </button>
    </form>
  );
}
