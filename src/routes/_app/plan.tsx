/**
 * The old standalone weekly-plan page.
 *
 * Folded into `/planner` as its "This week" tab — the week is a slice of the
 * year, and keeping them on separate routes meant two pages loading the same
 * roadmap and disagreeing while one of them was stale. Kept as a redirect
 * rather than deleted so existing links and bookmarks still land somewhere
 * sensible.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/plan")({
  beforeLoad: () => {
    throw redirect({ to: "/planner", search: { tab: "week" }, replace: true });
  },
});
