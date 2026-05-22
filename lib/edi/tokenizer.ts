// Minimal, robust X12 tokenizer.
//
// X12 files are flat strings of segments, each made of elements separated by an
// element delimiter and ending in a segment terminator. Some elements contain
// components separated by a component delimiter. Delimiters are declared by the
// fixed-width ISA header, so we read them from there when present and otherwise
// fall back to the most common conventions.

export interface EdiDelimiters {
  element: string;
  component: string;
  segment: string;
}

export interface EdiSegment {
  /** Segment identifier, e.g. "CLP", "SVC", "CAS". */
  id: string;
  /** Raw elements after the identifier (1-indexed in X12 docs; 0-indexed here). */
  elements: string[];
}

export interface TokenizedEdi {
  delimiters: EdiDelimiters;
  segments: EdiSegment[];
}

const DEFAULT_DELIMITERS: EdiDelimiters = {
  element: "*",
  component: ":",
  segment: "~"
};

export function detectDelimiters(raw: string): EdiDelimiters {
  const content = raw.replace(/^﻿/, "").replace(/^\s+/, "");
  if (content.startsWith("ISA") && content.length >= 106) {
    return {
      element: content[3],
      component: content[104],
      segment: content[105]
    };
  }
  return DEFAULT_DELIMITERS;
}

export function tokenize(raw: string): TokenizedEdi {
  const delimiters = detectDelimiters(raw);
  const content = raw.replace(/^﻿/, "");

  const segments: EdiSegment[] = [];
  for (const rawSegment of content.split(delimiters.segment)) {
    // Strip line breaks/whitespace introduced for readability between segments.
    const trimmed = rawSegment.replace(/[\r\n]+/g, "").trim();
    if (!trimmed) continue;
    const parts = trimmed.split(delimiters.element);
    const id = parts[0].trim();
    if (!id) continue;
    segments.push({ id, elements: parts.slice(1) });
  }

  return { delimiters, segments };
}

/** Split a composite element (e.g. "HC:99213:25") into its components. */
export function splitComponents(
  value: string | undefined,
  delimiters: EdiDelimiters
): string[] {
  if (!value) return [];
  return value.split(delimiters.component);
}

/** Detect whether a tokenized file is an 835, 837, or unknown transaction set. */
export function detectTransactionType(
  tokenized: TokenizedEdi
): "X835" | "X837" | "UNKNOWN" {
  for (const segment of tokenized.segments) {
    if (segment.id === "ST") {
      const code = segment.elements[0]?.trim();
      if (code === "835") return "X835";
      if (code === "837") return "X837";
    }
  }
  return "UNKNOWN";
}
