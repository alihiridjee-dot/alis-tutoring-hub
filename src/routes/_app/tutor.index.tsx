/**
 * The tutor's home: every student, and whether anything needs attention.
 *
 * "Needs setup" is shown prominently because a student with no level or no
 * enrolments cannot be given a plan at all — they will sit on an empty
 * dashboard until it's fixed, and nothing else in the app will say so.
 */
import { Link, createFileRoute } from "@tanstack/react-router";

import { Users } from "lucide-react";

import { EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { LEVEL_LABEL, SOURCE_LABEL } from "@/lib/session";
import { useStudents } from "@/lib/tutor";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tutor/")({ component: TutorHome });

function TutorHome() {
  const studentsQ = useStudents();

  if (studentsQ.isLoading) return <Spinner label="Loading your students" />;
  if (studentsQ.error) return <ErrorNote error={studentsQ.error} />;

  const students = studentsQ.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tutor"
        title="Your students"
        icon={Users}
        lede="Everyone on your books, and whether anything is blocking their plan."
      />

      {students.length === 0 ? (
        <EmptyState
          mascot="books"
          title="No students yet"
          body="Create an account in the Supabase dashboard and it appears here. New accounts default to the student role."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {students.map((s) => {
            const needsSetup = !s.level;
            return (
              <li key={s.id}>
                <Link
                  to="/tutor/students/$studentId"
                  params={{ studentId: s.id }}
                  // A student who cannot be given a plan gets an amber card, not
                  // an amber word inside a neutral one — the whole point of this
                  // page is spotting them without reading every row.
                  className={cn(
                    needsSetup ? "tint-amber" : "tint-primary",
                    "pop-card pop-card-interactive block h-full p-4",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="icon-tile font-display size-10 shrink-0 text-sm font-extrabold">
                      {(s.display_name || s.email || "?").slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display truncate text-base font-extrabold">
                        {s.display_name || s.email || "Unnamed student"}
                      </p>
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        {s.email}
                      </p>
                    </div>
                    <span className="chip shrink-0">{SOURCE_LABEL[s.source]}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {s.level ? (
                      <span className="chip">{LEVEL_LABEL[s.level]}</span>
                    ) : (
                      <span className="chip chip-solid">Needs setup</span>
                    )}
                    {s.confidence_seeded_at ? (
                      <span className="tint-emerald chip">Sorted</span>
                    ) : (
                      <span className="tint-slate chip">Not sorted yet</span>
                    )}
                  </div>

                  {needsSetup ? (
                    <p className="mt-3 text-xs font-semibold text-[color:var(--tint)]">
                      Set their level and subjects before they log in.
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
