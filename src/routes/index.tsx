import { createFileRoute, Link } from "@tanstack/react-router";
import { BrainCircuit, CalendarRange, ClipboardList, LineChart } from "lucide-react";

import { AgencyBanner } from "@/components/landing/AgencyBanner";

/**
 * The one public page.
 *
 * Not a sales funnel — there is no pricing, no testimonial wall and no sign-up
 * form, because nobody arrives here cold. Students come by referral or through
 * an agency and already have credentials by the time they see this.
 *
 * So the copy is written to someone who is ALREADY a student, not to a stranger
 * deciding whether to become one. It used to lead with a positioning line and
 * four feature cards addressed to a prospect — the wrong reader entirely. What
 * this page has to answer is "what is this thing for, and what will it do with
 * my year?", and the answer is: it holds the course between lessons and builds
 * on itself, week after week, until the exam.
 */
export const Route = createFileRoute("/")({
  component: LandingPage,
});

/**
 * The four things the hub does with a student's year, in the order they happen:
 * the year is laid out, work is set against it, weak points are brought back,
 * and the record of all three accumulates.
 *
 * Written as what it will do with YOUR course, not as a feature list, and kept
 * to the plainness of the hero paragraph above — two short sentences each, no
 * asides. They had drifted longer and cleverer than the line they sit under,
 * which made the page read as though it were selling itself to a stranger
 * again. Videos are named inside the lane that uses them rather than getting a
 * card: they are a resource attached to the work, not one of the four things
 * the year is built out of.
 */
const PILLARS = [
  {
    icon: CalendarRange,
    title: "Your year, mapped to your exam date",
    body: "Your whole spec is spread across the weeks between now and the exam, with revision time saved for the end. Miss a week and everything moves along with you.",
  },
  {
    icon: ClipboardList,
    title: "Homework set against the plan",
    body: "Set for you with a due date, and marked with written feedback. The mark counts towards the spec points the work covered, so it changes what comes next.",
  },
  {
    icon: BrainCircuit,
    title: "Weak points come back on their own",
    body: "Every spec point is tracked on its own. Anything shaky comes back just before you'd forget it, with a short video where there is one, and keeps coming back until it sticks.",
  },
  {
    icon: LineChart,
    title: "Progress that adds up all year",
    body: "Your ratings, your marks and what you've covered build up week by week. Nothing resets, so you can always see what's solid and what still needs work.",
  },
] as const;

function LandingPage() {
  return (
    <main className="page-aurora min-h-screen">
      <header className="glass-bar sticky top-0 z-30">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-display text-base font-bold tracking-tight">
            Ali&apos;s Tutoring Hub
          </span>
          <Link
            to="/auth"
            className="btn-solid inline-flex h-10 items-center rounded-xl px-5 text-sm font-semibold"
          >
            Log in
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-16 pt-16 sm:pt-24">
        <p className="eyebrow rise-in">For my current students</p>
        <h1 className="rise-in font-display mt-4 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl [--rise-delay:60ms]">
          Your course, tracked <span className="text-gradient">from this week to the exam</span>.
        </h1>
        {/* Just what the hub does. No subjects, no qualifications: the reader is
            a student who has already been assigned to Ali, so there is nobody
            here to convince and nothing to introduce. */}
        <p className="rise-in mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground [--rise-delay:120ms]">
          This hub is what runs between lessons. Your spec is laid out week by week, homework is set
          and marked against it, and the plan updates as your confidence and marks change.
        </p>
        <div className="rise-in mt-9 flex flex-wrap gap-3 [--rise-delay:180ms]">
          <Link
            to="/auth"
            className="btn-premium inline-flex h-12 items-center rounded-xl px-7 text-sm font-semibold"
          >
            Log in to your hub
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Accounts are created by Ali. If you don&apos;t have one yet, get in touch.
        </p>
      </section>

      <AgencyBanner />

      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          What happens between lessons
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <article key={title} className="premium-card rounded-2xl p-6">
              <span className="icon-tile mb-4 h-11 w-11 rounded-xl">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Ali&apos;s Tutoring Hub</span>
          <Link to="/auth" className="hover:text-primary">
            Student log in
          </Link>
        </div>
      </footer>
    </main>
  );
}
