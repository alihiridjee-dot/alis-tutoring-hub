/**
 * The signed-in navigation.
 *
 * Role-aware: the tutor's links replace the student's rather than sitting
 * alongside them, because the tutor has no plan or homework of their own — they
 * work through a student. The single overlap is Messages.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  CalendarRange,
  MessageSquare,
  NotebookPen,
  Users,
} from "lucide-react";

import { useSignOut, useViewer } from "@/lib/session";

// "This week" and "My plan" are two doors into the SAME page — /planner's week
// and full-plan tabs. They used to be separate routes, which meant two pages
// loading the same roadmap and disagreeing whenever one went stale. The pair of
// links stays because the week is what a student wants most days and burying it
// one tab deep would cost a click every time; `search` is what distinguishes
// them, and TanStack matches on it, so only one lights up at a time.
// There is no separate Review page — re-rating happens on the "My topics" tab,
// beside the plan it reshapes.
const STUDENT_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, search: undefined },
  { to: "/planner", label: "This week", icon: CalendarDays, search: { tab: "week" } },
  { to: "/planner", label: "My plan", icon: CalendarRange, search: { tab: "plan" } },
  { to: "/homework", label: "Homework", icon: NotebookPen, search: undefined },
  { to: "/curriculum", label: "Curriculum", icon: BookOpen, search: undefined },
  { to: "/messages", label: "Messages", icon: MessageSquare, search: undefined },
] as const;

const TUTOR_LINKS = [
  { to: "/tutor", label: "Students", icon: Users, search: undefined },
  { to: "/tutor/curriculum", label: "Curriculum", icon: BookOpen, search: undefined },
  { to: "/tutor/resources", label: "Resources", icon: NotebookPen, search: undefined },
  { to: "/tutor/marking", label: "Marking", icon: GraduationCap, search: undefined },
  { to: "/messages", label: "Messages", icon: MessageSquare, search: undefined },
] as const;

export function AppNav() {
  const viewer = useViewer();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const links = viewer.isTutor ? TUTOR_LINKS : STUDENT_LINKS;

  return (
    <header className="glass-bar sticky top-0 z-30">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 py-3">
          <Link
            to={viewer.isTutor ? "/tutor" : "/dashboard"}
            className="font-display text-sm font-bold tracking-tight"
          >
            Ali&apos;s Tutoring Hub
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {viewer.profile?.display_name || viewer.user?.email}
              {viewer.isTutor ? " · Tutor" : ""}
            </span>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/auth", replace: true });
              }}
              className="btn-soft inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs"
            >
              <LogOut className="size-3.5" aria-hidden />
              Sign out
            </button>
          </div>
        </div>

        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-2">
          {links.map(({ to, label, icon: Icon, search }) => (
            <Link
              key={`${to}-${label}`}
              to={to}
              search={search as never}
              activeOptions={{ exact: to === "/tutor" }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground data-[status=active]:bg-card data-[status=active]:font-semibold data-[status=active]:text-foreground"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
