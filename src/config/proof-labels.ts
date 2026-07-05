// The proof block's fixed header text for the DOCX export path, per the
// document's own language (passed in by the caller from
// document.templateSettings.primaryLang — same field as
// cross-ref-labels.ts). Kept in sync by hand with anvilnote-web's
// messages/*.json editor.proof.label and anvilnote-renderer's identical
// copy in src/config/proof-labels.ts.
export type ProofPrimaryLang = "zh" | "en" | "ja" | "ko" | "th";

const LABELS: Record<ProofPrimaryLang, string> = {
  zh: "證",
  en: "Proof.",
  ja: "証明",
  ko: "증명",
  th: "พิสูจน์",
};

const DEFAULT_PRIMARY_LANG: ProofPrimaryLang = "zh";

export function proofLabel(primaryLang: string | undefined): string {
  return primaryLang && primaryLang in LABELS
    ? LABELS[primaryLang as ProofPrimaryLang]
    : LABELS[DEFAULT_PRIMARY_LANG];
}
