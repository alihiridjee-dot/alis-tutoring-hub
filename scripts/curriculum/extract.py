from __future__ import annotations
"""
Shared PDF text extraction for the specification parsers.

Every board prints its content as a two-column table: the assessable statement
on the left, and a column of cross-references on the right (Edexcel's maths
skills, OCR's "Additional guidance" plus M/PAG/HSW codes). Naive text
extraction interleaves the two, so a spec point comes out with fragments of the
guidance column welded onto it.

So we extract in pypdf's layout mode, which preserves horizontal position as
whitespace, and cut each line at a column boundary detected from the page
itself. Only the left column survives. That is the difference between
transcribing a specification and inventing one.
"""

import re
import pypdf

# Tabs are used as inter-word spacing by both boards' PDFs.
_WS = re.compile(r"[ \t ]+")


def page_layout_lines(page) -> list[str]:
    return (page.extract_text(extraction_mode="layout") or "").split("\n")


def detect_gutter(lines: list[str], min_run: int = 6) -> int | None:
    """
    Find the x offset where the right-hand column starts.

    A real column gutter is a run of spaces at the SAME offset on many lines.
    We score every offset by how many lines have a long space-run starting
    there, and take the best one past the halfway mark. Returning None means
    the page has no second column, which is normal for prose pages.
    """
    width = max((len(l) for l in lines), default=0)
    if width < 60:
        return None

    votes: dict[int, int] = {}
    for line in lines:
        if not line.strip():
            continue
        for m in re.finditer(r" {%d,}" % min_run, line):
            start = m.start()
            # Only count gutters that actually have text after them.
            if line[m.end():].strip():
                votes[start] = votes.get(start, 0) + 1

    if not votes:
        return None

    # Bias to the right half: a gap in the middle of a sentence is not a gutter.
    candidates = {k: v for k, v in votes.items() if k > width * 0.35 and v >= 3}
    if not candidates:
        return None
    return max(candidates, key=lambda k: (candidates[k], -k))


def left_column(lines: list[str], gutter: int | None) -> list[str]:
    if gutter is None:
        return lines
    return [l[:gutter] for l in lines]


def clean(s: str) -> str:
    """Collapse the PDF's tab-spacing and stray hyphenation into plain text."""
    s = s.replace("–", "–").replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"')
    s = _WS.sub(" ", s)
    return s.strip()


def doc_lines(path, first=0, last=None, split_columns=True, layout=True):
    """
    Yield (page_index, line) for every page.

    `layout=True` preserves horizontal position as whitespace, which is what
    makes geometric column splitting possible — use it for OCR. `layout=False`
    is pypdf's ordinary reading-order extraction, where Edexcel's skills codes
    fall onto lines of their own and can simply be filtered out.
    """
    reader = pypdf.PdfReader(path)
    pages = reader.pages[first: last if last is not None else len(reader.pages)]
    for i, page in enumerate(pages, start=first):
        if layout:
            lines = page_layout_lines(page)
            if split_columns:
                lines = left_column(lines, detect_gutter(lines))
        else:
            lines = (page.extract_text() or "").split("\n")
        for line in lines:
            yield i, line.rstrip()


# Markers that only ever appear in the guidance / skills column. If one of
# these survives into a spec point title, the column split failed and the row
# must not be trusted.
BLEED = re.compile(
    r"\b(?:HSW\d|PAG\d{1,2}|M\d\.\d|CPAC|Version \d\.\d|© OCR|© Pearson|Pearson Education)\b"
)
