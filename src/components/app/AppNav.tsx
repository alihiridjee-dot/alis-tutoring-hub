/**
 * The signed-in navigation.
 *
 * Role-aware: the tutor's links replace the student's rather than sitting
 * alongside them, because the tutor has no plan or homework of their own — they
 * work through a student. The single overlap is Messages.
 *
 * Two presentations of the SAME link list:
 *
 *   • ≥ lg — a tab row in the header, index-tab styled, active item raised.
 *   • < lg — a fixed bottom bar. Students live on phones, and a horizontally
 *     scrolling strip of six links under a header meant the last two were
 *     effectively invisible. The bar is why `_app.tsx` pads the page bottom.
 *
 * Both render from `links`, so a route added here appears in both without a
 * second edit.
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
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, search: undefined },
  { to: "/planner", label: "This week", icon: CalendarDays, search: { tab: "week" } },
  { to: "/planner", label: "My plan", icon: CalendarRange, search: { tab: "plan" } },
  { to: "/homework", label: "Homework", icon: NotebookPen, search: undefined },
  { to: "/curriculum", label: "Spec", icon: BookOpen, search: undefined },
  { to: "/messages", label: "Messages", icon: MessageSquare, search: undefined },
] as const;

const TUTOR_LINKS = [
  { to: "/tutor", label: "Students", icon: Users, search: undefined },
  { to: "/tutor/curriculum", label: "Curriculum", icon: BookOpen, search: undefined },
  { to: "/tutor/resources", label: "Resources", icon: NotebookPen, search: undefined },
  { to: "/tutor/marking", label: "Marking", icon: GraduationCap, search: undefined },
  { to: "/messages", label: "Messages", icon: MessageSquare, search: undefined },
] as const;

/** The wordmark: a chunky monogram tile plus the name. */
export function Wordmark() {
  return (
    <span className="wordmark inline-flex items-center gap-2.5">
      <span className="icon-tile-solid icon-tile wordmark-tile font-display size-9 text-base font-extrabold text-white">
        A
      </span>
      <span className="font-display text-[0.95rem] font-extrabold leading-tight">
        Ali&apos;s
        <span className="block text-[0.7rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Tutoring Hub
        </span>
      </span>
    </span>
  );
}

export function AppNav() {
  const viewer = useViewer();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const links = viewer.isTutor ? TUTOR_LINKS : STUDENT_LINKS;
  const home = viewer.isTutor ? "/tutor" : "/dashboard";
  const name = viewer.profile?.display_name || viewer.user?.email || "";
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  return (
    <>
      <header className="glass-bar sticky top-0 z-30">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to={home} className="shrink-0">
            <Wordmark />
          </Link>

          <nav className="tab-row mx-auto hidden lg:flex">
            {links.map(({ to, label, icon: Icon, search }) => (
              <Link
                key={`${to}-${label}`}
                to={to}
                search={search as never}
                activeOptions={{ exact: to === "/tutor" }}
                className="tab-item"
              >
                <Icon className="tab-pop size-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            <span className="hidden max-w-[13rem] items-center gap-2 xl:flex">
              <span className="icon-tile font-display size-8 text-xs font-extrabold">
                {initials}
              </span>
              <span className="truncate text-xs font-semibold">
                {viewer.profile?.display_name || viewer.user?.email}
                {viewer.isTutor ? (
                  <span className="block text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                    Tutor
                  </span>
                ) : null}
              </span>
            </span>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/auth", replace: true });
              }}
              className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs"
              aria-label="Sign out"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Phone bar. `pb-[env(safe-area-inset-bottom)]` keeps the labels clear of
          the home indicator on iOS, where they otherwise sit under it. */}
      <nav className="glass-bar fixed inset-x-0 bottom-0 z-30 border-b-0 border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1.5 py-1.5">
          {links.map(({ to, label, icon: Icon, search }) => (
            <li key={`${to}-${label}`} className="flex-1">
              <Link
                to={to}
                search={search as never}
                activeOptions={{ exact: to === "/tutor" }}
                className="group flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[0.65rem] font-bold text-muted-foreground transition-colors data-[status=active]:text-[color:var(--primary)]"
              >
                <span className="flex size-8 items-center justify-center rounded-xl border border-transparent transition-colors group-data-[status=active]:border-[color:color-mix(in_oklab,var(--primary)_28%,transparent)] group-data-[status=active]:bg-[color:color-mix(in_oklab,var(--primary)_12%,transparent)]">
                  <Icon className="tab-pop size-[1.15rem]" aria-hidden />
                </span>
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
