/**
 * Tutor-only layout.
 *
 * RLS already stops a student reading anyone else's data, so this is not the
 * security boundary — but without it a student who types /tutor gets a "Your
 * students" page listing themselves, which is nonsense rather than a leak.
 * This turns that into an honest refusal.
 */
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";

import { Spinner } from "@/components/app/Shared";
import { useViewer } from "@/lib/session";

export const Route = createFileRoute("/_app/tutor")({ component: TutorLayout });

function TutorLayout() {
  const viewer = useViewer();

  if (!viewer.ready) return <Spinner label="Checking your access" />;

  if (!viewer.isTutor) {
    return (
      <div className="premium-card rounded-2xl p-8 text-center">
        <h1 className="font-display text-lg font-semibold">Not your side of the app</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          These pages are for the tutor. Your own work is on your dashboard.
        </p>
        <Link to="/dashboard" className="btn-soft mt-5 inline-flex rounded-xl px-4 py-2 text-sm">
          Back to my dashboard
        </Link>
      </div>
    );
  }

  return <Outlet />;
}
