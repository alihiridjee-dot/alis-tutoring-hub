/**
 * The planner route: loads the student's curriculum once and hands it to the
 * tabbed planner.
 *
 * All the data every tab needs is fetched here, at the top, rather than by each
 * tab. The queries are shared and cached anyway, but loading them in one place
 * means switching tabs never shows a second spinner for something the page
 * already had.
 *
 * The active tab lives in the URL so nav links can point at one directly and
 * the back button steps between them.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { StudentPlanner, PLANNER_TABS, type PlannerTab } from "@/components/app/StudentPlanner";
import { ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { useEnrolments, useViewer } from "@/lib/session";
import { useCurriculum, usePointConfidence, useSchedule } from "@/lib/study";

/**
 * `tab` is optional so a plain `<Link to="/planner">` still type-checks — a
 * required search param would force every link in the app to name a tab. An
 * absent or unrecognised value falls back to the week, which is the landing
 * view.
 */
type PlannerSearch = { tab?: PlannerTab };

export const Route = createFileRoute("/_app/planner")({
  validateSearch: (search: Record<string, unknown>): PlannerSearch => ({
    tab: PLANNER_TABS.includes(search.tab as PlannerTab) ? (search.tab as PlannerTab) : "week",
  }),
  component: PlannerPage,
});

function PlannerPage() {
  const { tab = "week" } = Route.useSearch();
  const navigate = useNavigate();
  const viewer = useViewer();
  const studentId = viewer.user?.id;

  const enrolmentsQ = useEnrolments(studentId);
  const curriculumQ = useCurriculum(viewer.profile?.level, enrolmentsQ.data);
  const scheduleQ = useSchedule(studentId);
  const confidenceQ = usePointConfidence(studentId);

  if (enrolmentsQ.isLoading || curriculumQ.isLoading || scheduleQ.isLoading) {
    return <Spinner label="Building your plan" />;
  }
  if (curriculumQ.error) return <ErrorNote error={curriculumQ.error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your plan"
        title="The year ahead"
        lede="Your whole course, paced to the exam — and what to do about it this week."
      />
      <StudentPlanner
        tab={tab}
        onTabChange={(next) =>
          void navigate({ to: "/planner", search: { tab: next }, replace: true })
        }
        data={{
          studentId,
          studentName: viewer.profile?.display_name ?? undefined,
          level: viewer.profile?.level,
          enrolments: enrolmentsQ.data ?? [],
          topics: curriculumQ.data?.topics ?? [],
          specPoints: curriculumQ.data?.specPoints ?? [],
          schedule: scheduleQ.data ?? new Map(),
          confidence: confidenceQ.data ?? new Map(),
        }}
      />
    </div>
  );
}
