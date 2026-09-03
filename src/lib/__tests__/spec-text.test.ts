import { describe, expect, test } from "bun:test";

import { parseSpecStatement } from "@/lib/spec-text";

describe("parseSpecStatement", () => {
  test("a plain statement is left exactly as it is", () => {
    const s = parseSpecStatement("the use of staining in light microscopy");
    expect(s).toEqual({
      lead: "the use of staining in light microscopy",
      items: [],
      seeAlso: [],
      missing: [],
    });
  });

  test("numbered sub-items become items, in order", () => {
    const s = parseSpecStatement(
      "(i) the acid dissociation constant, Ka (ii) the relationship between Ka and pKa",
    );
    expect(s.lead).toBe("");
    expect(s.items).toEqual([
      { marker: "(i)", text: "the acid dissociation constant, Ka" },
      { marker: "(ii)", text: "the relationship between Ka and pKa" },
    ]);
  });

  test("the words before the first sub-item stay as the lead", () => {
    const s = parseSpecStatement("calculations of pH for: (i) strong acids (ii) weak acids");
    expect(s.lead).toBe("calculations of pH for:");
    expect(s.items).toHaveLength(2);
  });

  test("cross-references are lifted out of the prose", () => {
    const s = parseSpecStatement(
      "a Brønsted–Lowry acid as a species that donates a proton (see also 2.1.4 Acids)",
    );
    expect(s.lead).toBe("a Brønsted–Lowry acid as a species that donates a proton");
    expect(s.seeAlso).toEqual(["2.1.4 Acids"]);
  });

  test("a cross-reference between two sub-items joins neither", () => {
    const s = parseSpecStatement(
      "(i) donates a proton (see also 2.1.4 b, 5.3.1 j) (ii) accepts one",
    );
    expect(s.items).toEqual([
      { marker: "(i)", text: "donates a proton" },
      { marker: "(ii)", text: "accepts one" },
    ]);
    expect(s.seeAlso).toEqual(["2.1.4 b", "5.3.1 j"]);
  });

  test("a marker with no text is reported, never rendered as a blank bullet", () => {
    // Ten real OCR A-Level Chemistry rows look like this: the sub-items exist
    // in the specification but their text was lost in extraction.
    const s = parseSpecStatement(
      "(i) a Brønsted–Lowry acid as a species that donates a proton (see also 2.1.4 Acids) (ii) (iii)",
    );
    expect(s.items).toHaveLength(1);
    expect(s.missing).toEqual(["(ii)", "(iii)"]);
  });

  test("a stray roman numeral in prose is not a list", () => {
    // Splitting here would cut the sentence in half. A list starts at (i).
    const s = parseSpecStatement("the reaction of period (iii) elements with oxygen");
    expect(s.items).toEqual([]);
    expect(s.lead).toBe("the reaction of period (iii) elements with oxygen");
  });
});
