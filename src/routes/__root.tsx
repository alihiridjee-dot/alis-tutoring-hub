import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode, createElement } from "react";

import appCss from "../styles.css?url";
import { Mascot } from "@/components/app/Doodles";
import { isSupabaseConfigured } from "@/integrations/supabase/env";

function NotFoundComponent() {
  return (
    <div className="page-aurora flex min-h-screen items-center justify-center px-4">
      <div className="pop-card pop-card-hero max-w-md p-8 text-center">
        <Mascot name="rocket" mood="wow" size={104} className="mx-auto" />
        <p className="numeral mt-4 text-6xl text-[color:var(--tint)]">404</p>
        <h1 className="font-display mt-2 text-xl font-extrabold">
          Nothing here — wrong turn somewhere
        </h1>
        <Link to="/" className="btn-hero mt-6 inline-flex rounded-xl px-6 py-3 text-sm">
          Back to home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("Root Error Component caught:", error);
  }, [error]);

  return (
    <div className="page-aurora flex min-h-screen items-center justify-center px-4">
      <div className="tint-rose pop-card pop-card-hero max-w-md p-8 text-center">
        <Mascot name="flask" mood="wow" size={96} className="mx-auto" inheritTint />
        <h1 className="font-display mt-4 text-xl font-extrabold">This page didn&apos;t load</h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          Something went wrong on our side, not yours.
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="btn-solid mt-6 inline-flex rounded-xl px-6 py-3 text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ali's Tutoring Hub" },
      {
        name: "description",
        content:
          "One-to-one GCSE and A-Level science tutoring. Spaced-repetition planning, weekly homework, and progress tracked spec point by spec point.",
      },
      { name: "robots", content: "noindex" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return createElement(
    "html",
    { lang: "en" },
    createElement("head", null, createElement(HeadContent)),
    createElement("body", null, children, createElement(Scripts)),
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // No backend wired up yet (Phase 0) — the public pages still render, so
    // don't instantiate the client just to subscribe to nothing.
    if (!isSupabaseConfigured()) return;
    let unsub = () => {};
    void (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      unsub = () => sub.subscription.unsubscribe();
    })();
    return () => unsub();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      {/* Toasts sit top-centre on phones, where a top-right toast lands under
          the thumb reaching for the nav. */}
      <Toaster richColors position="top-center" expand offset={16} />
    </QueryClientProvider>
  );
}
