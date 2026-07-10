// Same heuristic as anvilnote-web's src/lib/question-choices.ts and
// anvilnote-renderer's templates/shared/anvil-question.typ, ported here
// since there's no shared package between these three repos. Keep all
// three in sync if the thresholds ever change — see the reference
// personal template's own display-width()/choices() at
// /Users/anthonysung/tutoring/english/quiz/quiz-template.typ for the
// original source of the 14/28 thresholds.
export function displayWidth(s: string): number {
  let w = 0;
  for (const c of Array.from(s)) {
    const cp = c.codePointAt(0);
    w += cp !== undefined && cp >= 0x2e80 ? 2 : 1;
  }
  return w;
}

export function choiceColumns(options: string[]): 1 | 2 | 4 {
  const nonEmpty = options.filter((o) => o.trim() !== "");
  if (nonEmpty.length === 0) return 4;
  const avg = nonEmpty.reduce((sum, o) => sum + displayWidth(o), 0) / nonEmpty.length;
  if (avg <= 14) return 4;
  if (avg <= 28) return 2;
  return 1;
}
