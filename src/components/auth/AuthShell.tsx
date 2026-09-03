import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/app/AppNav";
import { Mascot } from "@/components/app/Doodles";

/**
 * Centred card on the brand backdrop, shared by log-in and password reset.
 *
 * The cast sits ON the card's top edge rather than inside it: a student's first
 * ever visit to this product is a password box, and three characters leaning
 * over the top of it is the whole first impression the hub gets to make.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-aurora flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link to="/" className="mb-8">
        <Wordmark />
      </Link>

      <div className="w-full max-w-md">
        <div className="relative z-10 flex translate-y-4 items-end justify-center gap-1 pl-6">
          <Mascot name="cell" size={58} className="[--idle-delay:-2.4s]" />
          <Mascot name="flask" size={66} mood="wink" className="[--idle-delay:0s]" />
          <Mascot name="bolt" size={54} className="[--idle-delay:-1.2s]" />
        </div>
        <div className="pop-card pop-card-hero rise-in relative p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}

/** Label + control pair, matching the spacing used across the tutor forms. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="font-display text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export const inputCls =
  "premium-input w-full h-12 rounded-xl px-4 text-sm font-medium placeholder:font-normal placeholder:text-muted-foreground/70";
