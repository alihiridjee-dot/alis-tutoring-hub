import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BrainCircuit,
  CalendarRange,
  Check,
  ClipboardList,
  LineChart,
  ArrowRight,
} from "lucide-react";

import { AgencyBanner } from "@/components/landing/AgencyBanner";
import { Wordmark } from "@/components/app/AppNav";
import { Mascot, Sparkles, Squiggle } from "@/components/app/Doodles";

/**
 * The one public page.
 *
 * Not a sales funnel — there is no pricing, no testimonial wall and no sign-up
 * form, because nobody arrives here cold. Students come by referral or through
 * an agency and already have credentials by the time they see this.
 *
 * So the copy is written to someone who is ALREADY a student, not to a stranger
 * deciding whether to become one. What this page has to answer is "what is this
 * thing for, and what will it do with my year?", and the answer is: it holds the
 * course between lessons and builds on itself, week after week, until the exam.
 *
 * The redesign adds a preview of the actual product beside the headline. A
 * student who has been handed a login has one question — "what am I logging in
 * to?" — and a picture of the week card answers it faster than the four
 * paragraphs below ever did.
 */
export const Route = createFileRoute("/")({
  component: LandingPage,
});

/**
 * The four things the hub does with a student's year, in the order they happen:
 * the year is laid out, work is set against it, weak points are brought back,
 * and the record of all three accumulates.
 *
 * Written as what it will do with YOUR course, not as a feature list. Each now
 * carries a tint, so the four cards read as four different things rather than
 * one thing repeated — and a `step` numeral, because they are a sequence.
 */
const PILLARS = [
  {
    icon: CalendarRange,
    tint: "tint-primary",
    step: "01",
    title: "Your year, mapped to your exam date",
    body: "Your whole spec is spread across the weeks between now and the exam, with revision time saved for the end. Miss a week and everything moves along with you.",
  },
  {
    icon: ClipboardList,
    tint: "tint-chem",
    step: "02",
    title: "Homework set against the plan",
    body: "Set for you with a due date, and marked with written feedback. The mark counts towards the spec points the work covered, so it changes what comes next.",
  },
  {
    icon: BrainCircuit,
    tint: "tint-bio",
    step: "03",
    title: "Weak points come back on their own",
    body: "Every spec point is tracked on its own. Anything shaky comes back just before you'd forget it, with a short video where there is one, and keeps coming back until it sticks.",
  },
  {
    icon: LineChart,
    tint: "tint-phys",
    step: "04",
    title: "Progress that adds up all year",
    body: "Your ratings, your marks and what you've covered build up week by week. Nothing resets, so you can always see what's solid and what still needs work.",
  },
] as const;

/**
 * A still of the real "This week" card.
 *
 * Hard-coded on purpose — it is a picture, not a live query, and the landing
 * page has no session to read one from. Kept visually identical to the planner's
 * card so the first thing a student sees after logging in is something they
 * already recognise.
 */
function WeekPreview() {
  const points = [
    { label: "Movement across membranes", done: true },
    { label: "Osmosis in plant cells", done: true },
    { label: "Active transport", done: false },
    { label: "Required practical 3", done: false },
  ];

  return (
    <div className="tint-bio pop-card pop-card-hero pop-card-banded p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="chip">Biology</span>
        <span className="font-display text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          Week 6 of 31
        </span>
      </div>

      <h3 className="font-display mt-4 text-2xl font-extrabold">Cell transport</h3>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-3 w-full overflow-hidden rounded-full border border-[color:color-mix(in_oklab,var(--tint)_20%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)]">
          <div className="bar-grow h-full rounded-full bg-[color:var(--tint)]" style={{ width: "72%" }} />
        </div>
        <span className="numeral shrink-0 text-sm text-[color:var(--tint)]">72%</span>
      </div>

      <ul className="mt-5 space-y-2">
        {points.map((p, i) => (
          <li
            key={p.label}
            className="surface-soft pop-in flex items-center gap-3 px-3 py-2.5 text-sm font-semibold"
            style={{ "--pop-delay": `${300 + i * 90}ms` } as React.CSSProperties}
          >
            <span
              className={
                p.done
                  ? "icon-tile-solid icon-tile size-6 rounded-lg"
                  : "icon-tile size-6 rounded-lg opacity-60"
              }
            >
              {p.done ? <Check className="size-3.5" aria-hidden /> : null}
            </span>
            <span className={p.done ? "text-muted-foreground line-through" : ""}>{p.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="chip tint-amber">Homework due Fri</span>
        <span className="font-display inline-flex items-center gap-1 text-sm font-extrabold text-[color:var(--tint)]">
          Start <ArrowRight className="size-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function LandingPage() {
  return (
    <main className="page-aurora min-h-screen">
      <header className="glass-bar sticky top-0 z-30">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-6">
          <Wordmark />
          <Link
            to="/auth"
            className="btn-hero inline-flex h-11 items-center rounded-xl px-6 text-sm font-bold"
          >
            Log in
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div>
          <span className="sticker stamp-in mb-6 inline-flex">
            <Sparkles className="size-4 text-[color:var(--pop-ink)]" />
            For my current students
          </span>

          <h1 className="rise-in font-display max-w-2xl text-[2.75rem] font-extrabold leading-[1.02] sm:text-6xl [--rise-delay:60ms]">
            Your course, tracked{" "}
            <span className="relative inline-block">
              <span className="marker">from this week</span>
            </span>{" "}
            to the exam.
            <Squiggle className="mt-2 h-3 w-56 text-[color:var(--primary)]" />
          </h1>

          {/* Just what the hub does. No subjects, no qualifications: the reader
              is a student who has already been assigned to Ali, so there is
              nobody here to convince and nothing to introduce. */}
          <p className="rise-in mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground [--rise-delay:120ms]">
            This hub is what runs between lessons. Your spec is laid out week by week, homework is
            set and marked against it, and the plan updates as your confidence and marks change.
          </p>

          <div className="rise-in mt-9 flex flex-wrap items-center gap-4 [--rise-delay:180ms]">
            <Link
              to="/auth"
              className="btn-hero inline-flex h-13 items-center gap-2 rounded-2xl px-8 py-3.5 text-base font-bold"
            >
              Log in to your hub
              <ArrowRight className="size-5" aria-hidden />
            </Link>
            {/* The cast, as a "these are your subjects" flourish. Small, but not
                so small the faces stop reading — under ~50px they turn back
                into plain icons and the charm is gone. */}
            <span className="hidden items-center gap-1 sm:flex">
              <Mascot name="cell" size={54} className="-mr-1" />
              <Mascot name="flask" size={54} className="-mr-1" />
              <Mascot name="bolt" size={54} />
            </span>
          </div>
          <p className="mt-5 text-xs font-semibold text-muted-foreground">
            Accounts are created by Ali. If you don&apos;t have one yet, get in touch.
          </p>
        </div>

        <div className="rise-in [--rise-delay:240ms]">
          <WeekPreview />
        </div>
      </section>

      <AgencyBanner />

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
        <p className="eyebrow">How it works</p>
        <h2 className="font-display mt-3 max-w-2xl text-3xl font-extrabold sm:text-4xl">
          What happens <span className="marker-tint marker">between lessons</span>
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {PILLARS.map(({ icon: Icon, title, body, tint, step }, i) => (
            <article
              key={title}
              className={`${tint} pop-card pop-card-interactive rise-in p-6`}
              style={{ "--rise-delay": `${i * 70}ms` } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="icon-tile size-12">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="numeral text-3xl text-[color:color-mix(in_oklab,var(--tint)_28%,transparent)]">
                  {step}
                </span>
              </div>
              <h3 className="font-display mt-4 text-lg font-extrabold leading-snug">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
        <div className="banner-strip flex flex-wrap items-center justify-between gap-6 px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex items-center gap-5">
            <Mascot name="rocket" mood="proud" size={92} />
            <div>
              <h2 className="font-display text-2xl font-extrabold sm:text-3xl">Ready when you are</h2>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                Log in and your week is already waiting — sorted, planned and pointed at the next
                thing worth doing.
              </p>
            </div>
          </div>
          <Link
            to="/auth"
            className="btn-hero inline-flex h-12 items-center gap-2 rounded-2xl px-7 text-sm font-bold"
          >
            Log in
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="border-t-2 border-dashed border-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-xs font-semibold text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Ali&apos;s Tutoring Hub</span>
          <Link to="/auth" className="hover:text-[color:var(--primary)]">
            Student log in
          </Link>
        </div>
      </footer>
    </main>
  );
}
