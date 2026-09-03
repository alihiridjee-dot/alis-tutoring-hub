/**
 * Subject colour-coding.
 *
 * Every screen that shows more than one subject at a time colours it the same
 * way, so a student learns the code once: Biology is green, Chemistry violet,
 * Physics blue. The colour is carried by a `tint-*` class on a wrapper rather
 * than by per-element classes — the design system's cards, meters, chips and
 * icon tiles all mix against `--tint`, so one class recolours a whole subtree.
 */
import { Atom, FlaskConical, Leaf, type LucideIcon } from "lucide-react";

import type { MascotName } from "@/components/app/Doodles";
import type { Database } from "@/integrations/supabase/types";

export type Subject = Database["public"]["Enums"]["subject"];

export const SUBJECT_TINT: Record<Subject, string> = {
  biology: "tint-bio",
  chemistry: "tint-chem",
  physics: "tint-phys",
};

export const SUBJECT_ICON: Record<Subject, LucideIcon> = {
  biology: Leaf,
  chemistry: FlaskConical,
  physics: Atom,
};

export const SUBJECT_MASCOT: Record<Subject, MascotName> = {
  biology: "cell",
  chemistry: "flask",
  physics: "bolt",
};

/** Safe for a `subject` that arrived as a plain string from a query. */
export function subjectTint(subject: string | null | undefined): string {
  return SUBJECT_TINT[subject as Subject] ?? "tint-primary";
}

export function subjectIcon(subject: string | null | undefined): LucideIcon | null {
  return SUBJECT_ICON[subject as Subject] ?? null;
}

export function subjectMascot(subject: string | null | undefined): MascotName {
  return SUBJECT_MASCOT[subject as Subject] ?? "books";
}
