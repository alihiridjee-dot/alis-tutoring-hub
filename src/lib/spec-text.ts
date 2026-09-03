/**
 * Reading the shape out of a spec point's wording.
 *
 * A spec point is stored as the exam board's own sentence, and the boards write
 * structure INTO that sentence rather than alongside it:
 *
 *   "(i) a Brønsted–Lowry acid as a species that donates a proton and a
 *    Brønsted–Lowry base as a species that accepts a proton (see also 2.1.4
 *    Acids) (ii) the role of H+ …"
 *
 * Rendered as one paragraph that is a wall — three separate things to learn,
 * a cross-reference to somewhere else in the spec, and the numbering that
 * separates them, all running together at the same weight. This pulls the three
 * apart so the list can be a list.
 *
 * Pure and defensive: anything it does not recognise comes back as `lead`, so a
 * statement it cannot parse renders exactly as it did before.
 */

/** One numbered thing to learn inside a statement. */
export type SpecItem = {
  /** The board's own marker — "(i)", "(ii)" — or "" for a plain bullet. */
  marker: string;
  text: string;
};

export type SpecStatement = {
  /** Everything before the first sub-item. Often the whole statement. */
  lead: string;
  items: SpecItem[];
  /** Cross-references lifted out of the prose: "2.1.4 Acids", "2.1.4 b". */
  seeAlso: string[];
  /**
   * Markers the board numbers but we hold no text for.
   *
   * Not cosmetic. On OCR A-Level Chemistry ten statements end in a bare
   * "(ii) (iii)" because the extraction lost those sub-items — real content
   * missing from the curriculum, which a blank bullet would hide and this
   * names.
   */
  missing: string[];
};

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
/** "(i)", "(ii)" … as the boards write them, anywhere in the sentence. */
const MARKER = new RegExp(`\\((${ROMAN.join("|")})\\)`, "g");
/** "(see also 2.1.4 Acids)", "(see also 2.1.4 b, 5.3.1 j)". */
const SEE_ALSO = /\(\s*see also\s+([^)]*)\)/gi;

/** Collapse the whitespace a split leaves behind, and drop dangling commas. */
function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.]+/, "")
    .trim();
}

export function parseSpecStatement(title: string): SpecStatement {
  const seeAlso: string[] = [];
  // Lifted out first, so a cross-reference sitting between two sub-items does
  // not get attached to whichever one happens to be next to it.
  const text = title.replace(SEE_ALSO, (_, refs: string) => {
    for (const r of refs.split(/[,;]/)) {
      const v = tidy(r);
      if (v) seeAlso.push(v);
    }
    return " ";
  });

  const marks = [...text.matchAll(MARKER)];
  if (marks.length === 0) {
    return { lead: tidy(text), items: [], seeAlso, missing: [] };
  }

  // Only treat them as a list if they actually run in order from (i). A stray
  // "(v)" in prose is not a numbered list, and splitting on it would cut a
  // sentence in half.
  if (marks[0][1] !== "i") {
    return { lead: tidy(text), items: [], seeAlso, missing: [] };
  }

  const items: SpecItem[] = [];
  const missing: string[] = [];
  marks.forEach((m, i) => {
    const from = m.index! + m[0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index! : text.length;
    const body = tidy(text.slice(from, to));
    if (body) items.push({ marker: `(${m[1]})`, text: body });
    else missing.push(`(${m[1]})`);
  });

  return { lead: tidy(text.slice(0, marks[0].index!)), items, seeAlso, missing };
}
