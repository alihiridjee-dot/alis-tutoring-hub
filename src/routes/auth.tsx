import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { isSupabaseConfigured } from "@/integrations/supabase/env";
import { AuthShell, Field, inputCls } from "@/components/auth/AuthShell";

/**
 * Log in — and nothing else.
 *
 * There is no sign-up tab and no invite flow, by design: Ali creates every
 * account directly in Supabase before the student is ever pointed at the site.
 * That removes email verification, role selection at signup, and the whole
 * onboarding funnel the previous product needed. A student's first ever visit
 * is a password box.
 */
type SearchParams = { redirect?: string };

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Log in | Ali's Tutoring Hub" }],
  }),
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Honour ?redirect= only for safe in-app paths (must start with a single "/")
  // so the parameter can't be used to bounce someone off-site.
  const dest =
    search.redirect && search.redirect.startsWith("/") && !search.redirect.startsWith("//")
      ? search.redirect
      : "/dashboard";

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: dest as never });
    });
  }, [navigate, dest]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      toast.error("No backend connected yet — add your Supabase keys to .env");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in");
      navigate({ to: dest as never });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email) return toast.error("Enter your email above first");
    if (!isSupabaseConfigured()) {
      toast.error("No backend connected yet — add your Supabase keys to .env");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };

  return (
    <AuthShell>
      <h1 className="font-display mb-1.5 text-[1.75rem] font-bold leading-tight tracking-tight">
        Welcome <span className="text-gradient">back</span>
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        Log in to see your planner, homework and progress.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email">
          <input
            required
            autoFocus
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder="Your password"
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="btn-premium h-12 w-full rounded-xl text-sm font-semibold"
        >
          {loading ? "Please wait…" : "Log in"}
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="w-full text-xs text-muted-foreground hover:text-primary"
        >
          Forgot password?
        </button>
      </form>

      <p className="mt-6 border-t border-border/70 pt-5 text-center text-xs text-muted-foreground">
        Accounts are set up by Ali. If you can&apos;t get in, get in touch directly.
      </p>
    </AuthShell>
  );
}
