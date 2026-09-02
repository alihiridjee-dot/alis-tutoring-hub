/**
 * The signed-in shell, and the only place auth is enforced in the client.
 *
 * Two gates, in order:
 *
 *   1. Signed in at all. If not, bounce to /auth carrying the path they wanted
 *      so they land back here after logging in.
 *   2. Sorted. A student who has never done the one-page confidence sort is
 *      held on /sort, because every other screen reads from cards that the sort
 *      is what creates. Tutors skip this entirely.
 *
 * Both run only once `ready` is true. Acting while the session is still
 * resolving would bounce a signed-in user to the login page on every refresh.
 *
 * This is convenience, not security: the real enforcement is RLS, which is why
 * a student hitting a tutor URL directly gets empty results rather than data.
 */
import { useEffect } from "react";
import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";

import { AppNav } from "@/components/app/AppNav";
import { Spinner } from "@/components/app/Shared";
import { useViewer } from "@/lib/session";
import { isSortDeferred } from "@/lib/sort-deferral";
import { isSupabaseConfigured } from "@/integrations/supabase/env";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const viewer = useViewer();
  const configured = isSupabaseConfigured();

  const onSort = location.pathname === "/sort";

  useEffect(() => {
    if (!configured || !viewer.ready) return;

    if (!viewer.signedIn) {
      void navigate({
        to: "/auth",
        search: { redirect: location.pathname },
        replace: true,
      });
      return;
    }

    if (viewer.needsSort && !onSort && !isSortDeferred()) {
      void navigate({ to: "/sort", replace: true });
    }
  }, [
    configured,
    viewer.ready,
    viewer.signedIn,
    viewer.needsSort,
    onSort,
    navigate,
    location.pathname,
  ]);

  if (!configured) {
    return (
      <main className="page-aurora flex min-h-screen items-center justify-center px-4">
        <div className="premium-card max-w-md rounded-2xl p-8 text-center">
          <h1 className="font-display text-lg font-semibold">No database connected</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then
            reload.
          </p>
          <Link to="/" className="btn-soft mt-5 inline-flex rounded-xl px-4 py-2 text-sm">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  // Hold the shell until we know who this is. Rendering children first would
  // fire their queries as an anonymous user and paint a flash of empty state.
  if (!viewer.ready || !viewer.signedIn) {
    return (
      <main className="page-aurora min-h-screen">
        <Spinner label="Checking your session" />
      </main>
    );
  }

  // Mid-redirect to the sort: don't paint the nav behind it.
  if (viewer.needsSort && !onSort && !isSortDeferred()) {
    return (
      <main className="page-aurora min-h-screen">
        <Spinner label="Setting up your hub" />
      </main>
    );
  }

  return (
    <div className="page-aurora min-h-screen">
      <AppNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
