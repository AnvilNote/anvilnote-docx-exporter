// Per-language cross-reference display text for the DOCX export path,
// based on the DOCUMENT's own language (template.options.primaryLang —
// the same field anvilnote-web's font picker uses), passed in by the
// caller (anvilnote-api's docx-export.service.ts, from
// document.templateSettings.primaryLang) — NOT any UI locale.
//
// Kept in sync by hand with anvilnote-web's messages/*.json
// editor.crossRef.labels and anvilnote-renderer's own copy of this same
// file — this repo doesn't depend on either's dependency graph, same
// reasoning as duplicating small shared constants elsewhere in this app
// (e.g. anvilnote-web/anvilnote-renderer's parallel config/callouts.ts).
//
// Figure/table: "{supplement} {number}" (space, no parens — "圖 1"/"Figure
// 1"). Equation: "{supplement} ({number})" (space AND parens — "式
// (1)"/"Equation (1)") — a deliberate design decision, not an oversight.
// Headings have no supplement; a heading crossRef is just its own text.
export type CrossRefPrimaryLang = "zh" | "en" | "ja" | "ko" | "th";

const SUPPLEMENTS: Record<CrossRefPrimaryLang, { figure: string; table: string; equation: string }> = {
  zh: { figure: "圖", table: "表", equation: "式" },
  en: { figure: "Figure", table: "Table", equation: "Equation" },
  ja: { figure: "図", table: "表", equation: "式" },
  ko: { figure: "그림", table: "표", equation: "식" },
  th: { figure: "รูปที่", table: "ตารางที่", equation: "สมการ" },
};

const DEFAULT_PRIMARY_LANG: CrossRefPrimaryLang = "zh";

function normalizePrimaryLang(value: string | undefined): CrossRefPrimaryLang {
  return value && value in SUPPLEMENTS ? (value as CrossRefPrimaryLang) : DEFAULT_PRIMARY_LANG;
}

// `value` is the already-resolved number string, from the crossRef node's
// own resolvedValue attr (anvilnote-web's cross-ref.ts) — this only
// formats it, never recomputes it. A named equation's refName is only a
// readable label in the editor's @ suggestion list — resolvedValue is
// always the plain sequence number regardless, confirmed directly with the
// user (a named equation's crossRef still shows "式 (1)", not the name).
export function formatCrossRefLabel(
  kind: "figure" | "table" | "equation" | "heading",
  value: string,
  primaryLang: string | undefined,
): string {
  if (kind === "heading") return value;

  const lang = normalizePrimaryLang(primaryLang);
  const supplement = SUPPLEMENTS[lang][kind];
  return kind === "equation" ? `${supplement} (${value})` : `${supplement} ${value}`;
}
