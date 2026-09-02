/**
 * The tutor's home: every student, and whether anything needs attention.
 *
 * "Needs setup" is shown prominently because a student with no level or no
 * enrolments cannot be given a plan at all — they will sit on an empty
 * dashboard until it's fixed, and nothing else in the app will say so.
 */
import { Link, createFileRoute } from "@tanstack/react-router";

import { EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { LEVEL_LABEL, SOURCE_LABEL } from "@/lib/session";
import { useStudents } from "@/lib/tutor";

export const Route = createFileRoute("/_app/tutor/")({ component: TutorHome });

function TutorHome() {
  const studentsQ = useStudents();

  if (studentsQ.isLoading) return <Spinner label="Loading your students" />;
  if (studentsQ.error) return <ErrorNote error={studentsQ.error} />;

  const students = studentsQ.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Tutor" title="Your students" />

      {students.length === 0 ? (
        <EmptyState
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
                  className="premium-card-interactive block rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {s.display_name || s.email || "Unnamed student"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                    </div>
                    <span className="chip shrink-0 text-xs">{SOURCE_LABEL[s.source]}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.level ? (
                      <span className="chip text-xs">{LEVEL_LABEL[s.level]}</span>
                    ) : (
                      <span className="chip bg-amber-100 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        Needs setup
                      </span>
                    )}
                    {s.confidence_seeded_at ? (
                      <span className="chip text-xs">Sorted</span>
                    ) : (
                      <span className="chip text-xs text-muted-foreground">Not sorted yet</span>
                    )}
                  </div>

                  {needsSetup ? (
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
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
