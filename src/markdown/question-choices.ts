// Same heuristic as anvilnote-web's src/lib/question-choices.ts and
// anvilnote-renderer's src/converters/choice-columns.ts, ported here
// since there's no shared package between these three repos. Keep all
// three in sync if the thresholds ever change — see the reference
// personal template's own display-width()/choices() at
// /Users/anthonysung/tutoring/english/quiz/quiz-template.typ for the
// original source of the 14/28 thresholds.
//
// v3 (rich content): a choice is no longer necessarily plain text — it
// can be a single image or a block-math equation (choiceItem's content
// is "paragraph | image | blockMath"). Neither has a natural "character
// width", so both count as a flat nominal width in the same averaging
// math a text choice's real displayWidth() would otherwise contribute,
// tuned so a single image/equation choice alone pushes the layout
// toward 1 column (matches a long text choice) while a couple of them
// mixed with short text choices can still average into 2 columns.
export type ChoiceEntry =
  | { kind: "text"; text: string }
  | { kind: "image" }
  | { kind: "blockMath" };

const IMAGE_OR_MATH_NOMINAL_WIDTH = 20;

export function displayWidth(s: string): number {
  let w = 0;
  for (const c of Array.from(s)) {
    const cp = c.codePointAt(0);
    w += cp !== undefined && cp >= 0x2e80 ? 2 : 1;
  }
  return w;
}

function entryWidth(entry: ChoiceEntry): number {
  return entry.kind === "text" ? displayWidth(entry.text) : IMAGE_OR_MATH_NOMINAL_WIDTH;
}

function isEntryEmpty(entry: ChoiceEntry): boolean {
  return entry.kind === "text" && entry.text.trim() === "";
}

export function choiceColumns(entries: ChoiceEntry[]): 1 | 2 | 4 {
  const nonEmpty = entries.filter((e) => !isEntryEmpty(e));
  if (nonEmpty.length === 0) return 4;
  const avg = nonEmpty.reduce((sum, e) => sum + entryWidth(e), 0) / nonEmpty.length;
  if (avg <= 14) return 4;
  if (avg <= 28) return 2;
  return 1;
}
