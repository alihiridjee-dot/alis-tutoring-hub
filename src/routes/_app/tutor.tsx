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
import { Mascot } from "@/components/app/Doodles";
import { useViewer } from "@/lib/session";

export const Route = createFileRoute("/_app/tutor")({ component: TutorLayout });

function TutorLayout() {
  const viewer = useViewer();

  if (!viewer.ready) return <Spinner label="Checking your access" />;

  if (!viewer.isTutor) {
    return (
      <div className="pop-card p-8 text-center">
        <Mascot name="bolt" mood="wow" size={92} className="mx-auto mb-4" />
        <h1 className="font-display text-xl font-extrabold">Not your side of the app</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          These pages are for the tutor. Your own work is on your dashboard.
        </p>
        <Link to="/dashboard" className="btn-soft mt-6 inline-flex rounded-xl px-5 py-2.5 text-sm">
          Back to my dashboard
        </Link>
      </div>
    );
  }

  return <Outlet />;
}
