import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Centred card on the brand backdrop, shared by log-in and password reset. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-aurora flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link
        to="/"
        className="font-display mb-8 text-base font-bold tracking-tight hover:text-primary"
      >
        Ali&apos;s Tutoring Hub
      </Link>
      <div className="premium-card rise-in w-full max-w-md rounded-3xl p-6 sm:p-8">{children}</div>
    </main>
  );
}

/** Label + control pair, matching the spacing used across the tutor forms. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export const inputCls =
  "premium-input w-full h-11 rounded-xl px-3.5 text-sm placeholder:text-muted-foreground/70";
