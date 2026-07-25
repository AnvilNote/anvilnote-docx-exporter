import type { TiptapMark, TiptapNode } from "../types.js";
import { formatCrossRefLabel } from "../config/cross-ref-labels.js";
import { proofLabel } from "../config/proof-labels.js";
import { choiceColumns, type ChoiceEntry } from "./question-choices.js";
import { renderTableOoxml } from "./table-ooxml.js";

// Converts a Tiptap `doc` node to Pandoc-flavored Markdown: GFM tables,
// $…$ / $$…$$ math (Pandoc's native math extension), and — the one place
// this diverges from plain Markdown — callouts as fenced divs
// (`::: {.callout .kind title="..."} ... :::`), which callout.lua then maps
// to Word paragraph styles. This is a standalone converter (not shared with
// anvilnote-web's backup-export Markdown), because that exporter's callout
// format (blockquote + bold label) is tuned for round-tripping through
// markdown-to-tiptap.ts, a concern this package doesn't have.

function asNodes(content: unknown): TiptapNode[] {
  return Array.isArray(content) ? (content as TiptapNode[]) : [];
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

// Question numbering: same "count in document order, reset per export
// run" convention as anvilnote-web's live-counted numbering
// (question-node-view.tsx's useQuestionNumber) and anvilnote-renderer's
// Typst q-num counter — all three independently derive the same numbers
// from the same rule, no cross-repo sync needed. Reset at the top/bottom
// of tiptapToPandocMarkdown(), same lifecycle as footnoteContentById/
// footnoteDefs/primaryLang below.
let questionCounter = 0;

// Figure captions are a plain string attribute (an <input> in the editor,
// not real ProseMirror content — see anvilnote-web's caption-math.ts), so
// math support there is just a $$...$$ convention (the editor's own
// inlineMath delimiter) rather than a real inlineMath node. Swapped to a
// single $...$ to match this file's own inline math elsewhere — no LaTeX
// translation needed, Pandoc's math extension takes the source as-is.
function renderCaptionMarkdown(caption: string): string {
  return caption.replace(/\$\$([^$\n]+?)\$\$/g, "$$$1$$");
}

// Footnote definitions collected in body-encounter order during the current
// conversion (reset per tiptapToPandocMarkdown call). Pandoc's native
// footnote syntax (`[^N]` / `[^N]: content`) needs no fenced-div filter,
// unlike callouts — the definitions just get appended after the body.
let footnoteDefs: [label: string, content: string][] | null = null;
// data-id -> rendered content, built once per conversion from the doc's
// trailing `footnotes` node before the body is rendered.
let footnoteContentById: Map<string, string> | null = null;
// The document's own language (document.templateSettings.primaryLang), for
// formatting crossRef display text — see config/cross-ref-labels.ts.
let primaryLang: string | undefined;

function attrLatex(node: TiptapNode): string {
  const attrs = node.attrs ?? {};
  for (const key of ["latex", "formula", "equation", "value"]) {
    const value = attrs[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return typeof node.text === "string" ? node.text : "";
}

function textContent(content: unknown): string {
  return asNodes(content)
    .map((node) => (typeof node.text === "string" ? node.text : textContent(node.content)))
    .join("");
}

// --- inline -----------------------------------------------------------

function renderTextNode(node: TiptapNode): string {
  const raw = typeof node.text === "string" ? node.text : "";
  if (!raw) return "";
  const marks: TiptapMark[] = Array.isArray(node.marks) ? node.marks : [];
  const isCode = marks.some((mark) => mark?.type === "code");

  let out = isCode ? `\`${raw.replace(/`/g, "\\`")}\`` : raw;

  for (const mark of marks) {
    switch (mark?.type) {
      case "bold":
        out = `**${out}**`;
        break;
      case "italic":
        out = `*${out}*`;
        break;
      case "strike":
        out = `~~${out}~~`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "link": {
        const href = mark.attrs?.href;
        if (typeof href === "string" && href) {
          out = `[${out}](${href})`;
        }
        break;
      }
      default:
        break;
    }
  }

  return out;
}

function inlineToMarkdown(content: unknown): string {
  return asNodes(content)
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      const type = node.type;
      if (type === "text") return renderTextNode(node);
      if (type === "inlineMath" || type === "math") {
        const latex = attrLatex(node);
        return latex.trim() ? `$${latex}$` : "";
      }
      if (type === "hardBreak") return "  \n";
      if (type === "footnoteReference") {
        const id = node.attrs?.["data-id"];
        const label =
          typeof node.attrs?.referenceNumber === "string" ||
          typeof node.attrs?.referenceNumber === "number"
            ? String(node.attrs.referenceNumber)
            : "";
        const content = typeof id === "string" ? footnoteContentById?.get(id) : undefined;
        if (!label || content === undefined) return "";
        footnoteDefs?.push([label, content]);
        return `[^${label}]`;
      }
      if (type === "crossRef") {
        // No live re-numbering here (unlike the PDF/Typst path's real
        // @label refs) — DOCX (via this Markdown intermediate + Pandoc)
        // just prints whatever the editor's own resolver (anvilnote-web's
        // cross-ref.ts) already computed and stored on the node the last
        // time the document was edited/saved, formatted per the document's
        // own language (see config/cross-ref-labels.ts). A dangling
        // reference (target deleted) prints nothing, same as a footnote
        // reference whose content went missing above.
        const kind = node.attrs?.resolvedKind;
        const value = node.attrs?.resolvedValue;
        if (node.attrs?.broken || typeof kind !== "string" || typeof value !== "string") {
          return "";
        }
        return formatCrossRefLabel(
          kind as "figure" | "figureSub" | "table" | "equation" | "heading",
          value,
          primaryLang,
        );
      }
      if (type === "questionBlank") {
        // No live re-numbering here, same as crossRef just above — DOCX (via
        // this Markdown intermediate) prints whatever anvilnote-web's own
        // cross-ref.ts resolver already computed and stored on the node.
        const value = node.attrs?.resolvedValue;
        if (node.attrs?.broken || typeof value !== "string") {
          return "";
        }
        return `(${value})`;
      }
      if (type === "inlineBlank") {
        // No attrs — a fixed-width blank, not a reference. Escaped
        // underscores, same reasoning as the written-answer lines case
        // below in this file: a bare run of 3+ underscores is Pandoc's
        // own thematic-break syntax (collapses into an HorizontalRule),
        // so each one is escaped (`\_`) to stay literal text instead. 6
        // characters approximates the PDF path's fixed 3em width (see
        // anvil-question.typ's inline-blank()) at a typical body font
        // size — this is a Markdown/DOCX-side visual approximation, not
        // a real matching measurement the way the Typst path's literal
        // 3em unit is.
        return "\\_".repeat(6);
      }
      return "";
    })
    .join("");
}

// --- blocks -------------------------------------------------------------

function indentLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}

function renderList(node: TiptapNode, ordered: boolean): string {
  const lines: string[] = [];
  let n = 1;
  for (const item of asNodes(node.content)) {
    const inlineParts: string[] = [];
    const nestedParts: string[] = [];
    for (const child of asNodes(item.content)) {
      if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") {
        nestedParts.push(indentLines(renderBlock(child), "  "));
      } else {
        inlineParts.push(renderBlock(child));
      }
    }
    const marker = ordered ? `${n}.` : "-";
    lines.push(`${marker} ${inlineParts.join(" ").trim()}`.trim());
    lines.push(...nestedParts);
    n += 1;
  }
  return lines.join("\n");
}

function renderTaskList(node: TiptapNode): string {
  const lines: string[] = [];
  for (const item of asNodes(node.content)) {
    const checked = item.attrs?.checked === true;
    const inner = asNodes(item.content).map((child) => renderBlock(child)).join(" ").trim();
    lines.push(`- [${checked ? "x" : " "}] ${inner}`.trim());
  }
  return lines.join("\n");
}

const OOXML_TABLE_NODE_TYPES = new Set([
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "paragraph",
  "text",
  "hardBreak",
  "bulletList",
  "orderedList",
  "listItem",
]);
const OOXML_TABLE_MARK_TYPES = new Set(["bold", "italic", "underline", "strike"]);

function canRenderTableAsOoxml(node: TiptapNode): boolean {
  if (typeof node.type !== "string" || !OOXML_TABLE_NODE_TYPES.has(node.type)) return false;
  if (
    Array.isArray(node.marks) &&
    node.marks.some((mark) => typeof mark.type !== "string" || !OOXML_TABLE_MARK_TYPES.has(mark.type))
  ) {
    return false;
  }
  return asNodes(node.content).every(canRenderTableAsOoxml);
}

function renderTableMarkdown(node: TiptapNode): string {
  const rows = asNodes(node.content).filter((row) => row.type === "tableRow");
  if (rows.length === 0) return "";

  const firstCells = asNodes(rows[0].content);
  const hasHeader =
    firstCells.length > 0 && firstCells.every((cell) => cell.type === "tableHeader");
  const columns = firstCells.length || 1;
  const cellText = (cell: TiptapNode) =>
    escapeCell(renderBlocks(asNodes(cell.content)).replace(/\n+/g, " ").trim());
  const headerCells = hasHeader
    ? firstCells.map(cellText)
    : Array.from({ length: columns }, () => "");
  const bodyRows = hasHeader ? rows.slice(1) : rows;
  const lines = [
    `| ${headerCells.join(" | ")} |`,
    `| ${headerCells.map(() => "---").join(" | ")} |`,
  ];
  for (const row of bodyRows) {
    lines.push(`| ${asNodes(row.content).map(cellText).join(" | ")} |`);
  }
  return lines.join("\n");
}

function renderImage(node: TiptapNode): string {
  const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
  if (!src) return "";
  const caption = typeof node.attrs?.caption === "string" ? node.attrs.caption.trim() : "";
  return `![${renderCaptionMarkdown(caption)}](${src})`;
}

// Escapes a value for use inside a fenced-div attribute's double quotes.
function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// OOXML has no direct equivalent of Typst's `line()`/CSS's `<hr>` — the
// standard Word technique is a paragraph-bottom-border on an otherwise
// empty paragraph. Raw OOXML (same `{=openxml}` fenced-block technique as
// the 1-column choice line further down this file — see that block's own
// comment for why: a Div with a reference.docx `custom-style` silently
// loses its formatting the moment `--lua-filter callout.lua` is in the
// same pandoc invocation, which it always is here), not a fenced div +
// Lua filter mapping, since thickness/style are continuous values with no
// fixed paragraph-style equivalent the way callout kinds have.
const OOXML_BORDER_VAL: Record<string, string> = {
  solid: "single",
  dashed: "dashed",
  dotted: "dotted",
  dashdot: "dotDash",
};

function renderDivider(node: TiptapNode): string {
  const thickness = typeof node.attrs?.thicknessPt === "number" ? node.attrs.thicknessPt : 0.5;
  const lineStyle = typeof node.attrs?.lineStyle === "string" ? node.attrs.lineStyle : "solid";
  const val = OOXML_BORDER_VAL[lineStyle] ?? "single";
  // w:sz is in eighths of a point; valid range is 2 (0.25pt) to 96 (12pt).
  const sz = Math.min(96, Math.max(2, Math.round(thickness * 8)));
  return `\`\`\`{=openxml}\n<w:p><w:pPr><w:pBdr><w:bottom w:val="${val}" w:sz="${sz}" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>\n\`\`\``;
}

function renderCallout(node: TiptapNode): string {
  const kind = typeof node.attrs?.kind === "string" ? node.attrs.kind : "note";
  const title = typeof node.attrs?.title === "string" ? node.attrs.title.trim() : "";
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
  const inner = renderBlocks(asNodes(node.content));
  return `::: {.callout .${kind}${titleAttr}}\n${inner}\n:::`;
}

// choices() renders as a Pandoc pipe table when the column count is
// more than 1 — GFM tables are what Pandoc maps onto a real Word table
// (matching the PDF/Typst side's grid() layout at that point); 1 column
// instead renders as a plain line-per-choice list, matching
// anvilnote-renderer's own choices() Typst function taking the same
// branch. The last row is padded with empty cells if the option count
// doesn't divide evenly into the column count.
//
// `forceOneColumn` (multi-choice items — see renderQuestionItem below)
// skips the choiceColumns() heuristic entirely and always renders one
// option per line, matching the Typst side's own `columns: 1` override —
// per explicit feedback, single and multi share only the (A)/(B)/...
// label style, not the column layout.
const CHOICE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// A minimal XML text-content escape (element text, not attribute values —
// only &/</> need it there). Used below since raw OOXML paragraphs bypass
// Pandoc's own markdown-to-XML escaping entirely.
function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// v3 (rich content): a choiceItem's content is exactly one of
// paragraph/image/blockMath — this pairs the typed ChoiceEntry (used
// for the choiceColumns() width heuristic, plain-text only) with the
// real inner node (used for actual rendering, marks and all).
interface ChoiceItemEntry {
  label: string;
  entry: ChoiceEntry;
  inner: TiptapNode;
}

function choiceItemEntries(choiceListNode: TiptapNode): ChoiceItemEntry[] {
  const items = asNodes(choiceListNode.content);
  const withoutLabels = items.map((item): { entry: ChoiceEntry; inner: TiptapNode } => {
    const inner = asNodes(item.content)[0];
    if (!inner) return { entry: { kind: "text", text: "" }, inner: { type: "paragraph", content: [] } };
    if (inner.type === "image") return { entry: { kind: "image" }, inner };
    if (inner.type === "blockMath") return { entry: { kind: "blockMath" }, inner };
    return { entry: { kind: "text", text: textContent(inner.content) }, inner };
  });
  // Empty text choices are dropped before labeling, same as the old
  // string[]-based behavior (choices.filter((c) => c.trim() !== "")) —
  // an image/blockMath choice is never "empty" in this sense.
  const nonEmpty = withoutLabels.filter(
    ({ entry }) => !(entry.kind === "text" && entry.text.trim() === ""),
  );
  return nonEmpty.map(({ entry, inner }, i) => ({
    label: CHOICE_LABELS[i] ?? String(i + 1),
    entry,
    inner,
  }));
}

// Renders a single choice's content as plain Pandoc markdown — used for
// pipe-table cells (multi-column layout), where every cell is just
// inline markdown text regardless of choice type. Text choices reuse
// the same inline-marks renderer every other paragraph in this file
// goes through (inlineToMarkdown), so bold/italic/inline-math already
// work for free. Image choices reuse the existing body-image renderer
// (renderImage). blockMath choices reuse the existing latex extraction
// (attrLatex) but with a single-$ inline delimiter (not the block $$
// this file's body blockMath case uses) so it stays on the choice's own
// line inside a table cell instead of breaking the cell.
function renderChoiceContentMarkdown(entry: ChoiceEntry, inner: TiptapNode): string {
  if (entry.kind === "image") return renderImage(inner);
  if (entry.kind === "blockMath") {
    const latex = attrLatex(inner);
    return latex.trim() ? `$${latex}$` : "";
  }
  return inlineToMarkdown(inner.content);
}

// Converts a paragraph's content array to real OOXML runs (`<w:r>`),
// applying `<w:rPr>` for bold/italic/underline/strike from each text
// node's own marks — used ONLY inside the raw-OOXML 1-column choice
// line below, where Pandoc's own markdown-to-OOXML mark handling is
// bypassed entirely (see renderChoiceLine's own comment), so marks have
// to be turned into real run formatting by hand here instead of via
// `**bold**` markdown syntax.
function renderInlineOoxmlRuns(content: TiptapNode[]): string {
  return content
    .map((node) => {
      if (node.type !== "text" || typeof node.text !== "string" || !node.text) return "";
      const marks: TiptapMark[] = Array.isArray(node.marks) ? node.marks : [];
      const rPrParts: string[] = [];
      for (const mark of marks) {
        switch (mark?.type) {
          case "bold":
            rPrParts.push("<w:b/>");
            break;
          case "italic":
            rPrParts.push("<w:i/>");
            break;
          case "underline":
            rPrParts.push('<w:u w:val="single"/>');
            break;
          case "strike":
            rPrParts.push("<w:strike/>");
            break;
          default:
            break;
        }
      }
      const rPr = rPrParts.length > 0 ? `<w:rPr>${rPrParts.join("")}</w:rPr>` : "";
      return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(node.text)}</w:t></w:r>`;
    })
    .join("");
}

// Each 1-column choice line renders as a raw OOXML paragraph (a Pandoc
// ```{=openxml} fenced block, passed straight through to the docx
// writer) with an explicit w:spacing w:before="176" (twips) — 0.8em at
// the doc's own 11pt default body size (assets/reference.docx's
// docDefaults' rPrDefault sz is 22 half-points = 11pt; 0.8 * 11pt =
// 8.8pt = 176 twips, 1pt = 20 twips) — matching the web editor's own
// 0.8em gap-y and the PDF/Typst side's own 0.8em row-gutter.
//
// NOT a Div with a `custom-style` pointing at a named paragraph style in
// reference.docx — that was tried first and worked in isolation, but
// broke (silently fell back to Pandoc's own generic "Compact" style,
// losing the spacing) the moment `--lua-filter callout.lua` was in the
// same pandoc invocation, confirmed via direct experimentation to be
// true for ANY --lua-filter (even a no-op one defining zero functions),
// not something specific to callout.lua's own logic. Since this
// exporter's real CLI pipeline always loads that filter (see
// pandoc.ts's runPandoc), custom-style was a dead end here. Raw OOXML
// paragraphs bypass Pandoc's style-name resolution entirely and survive
// the filter untouched — confirmed against the exact real invocation
// (markdown+fenced_divs, --lua-filter callout.lua, --reference-doc,
// --mathml) before relying on it.
//
// v3 (rich content): a text choice keeps this exact raw-OOXML shape
// (now with real <w:b/>/<w:i/>/... run formatting per mark, via
// renderInlineOoxmlRuns, instead of the old plain-text-only <w:t>). An
// image/blockMath choice can't be hand-built as raw OOXML from inside
// this markdown-intermediate step — there's no access here to Pandoc's
// own media-relationship machinery (the .docx zip's image parts /
// relationship IDs) or its LaTeX-to-OMML math conversion from outside a
// real Pandoc parse — so those fall back to a normal Pandoc markdown
// paragraph (image markdown / inline math), which Pandoc itself still
// converts to a real embedded drawing / OMML equation on the way to
// .docx, just without this exact tuned 0.8em space-before (default Word
// paragraph spacing applies instead for that one line).
function renderChoiceLine(label: string, entry: ChoiceEntry, inner: TiptapNode): string {
  if (entry.kind === "text") {
    const labelRun = `<w:r><w:t xml:space="preserve">(${label}) </w:t></w:r>`;
    const textRuns = renderInlineOoxmlRuns(asNodes(inner.content));
    return `\`\`\`{=openxml}\n<w:p><w:pPr><w:spacing w:before="176" w:after="0"/></w:pPr>${labelRun}${textRuns}</w:p>\n\`\`\``;
  }
  return `(${label}) ${renderChoiceContentMarkdown(entry, inner)}`;
}

function renderChoices(items: ChoiceItemEntry[], forceOneColumn: boolean): string {
  if (items.length === 0) return "";
  const columns = forceOneColumn ? 1 : choiceColumns(items.map((item) => item.entry));

  if (columns === 1) {
    return items.map(({ label, entry, inner }) => renderChoiceLine(label, entry, inner)).join("\n\n");
  }

  const cells = items.map(
    ({ label, entry, inner }) => `(${label}) ${renderChoiceContentMarkdown(entry, inner)}`,
  );
  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += columns) {
    const row = cells.slice(i, i + columns);
    while (row.length < columns) row.push("");
    rows.push(row);
  }
  const lines = [
    `| ${Array.from({ length: columns }, () => "").join(" | ")} |`,
    `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ];
  return lines.join("\n");
}

// "question" is now a pure container (v2 restructure) — see this
// feature's design doc. It has no rendering of its own, just its
// children (questionItem nodes) in order.
function renderQuestion(node: TiptapNode): string {
  return renderBlocks(asNodes(node.content));
}

function renderQuestionItem(node: TiptapNode): string {
  questionCounter += 1;
  const kind = typeof node.attrs?.kind === "string" ? node.attrs.kind : "single";
  const body = renderBlocks(asNodes(node.content));
  const heading = `**${questionCounter}.** ${body}`;

  if (kind === "written") {
    const writtenMode = typeof node.attrs?.writtenMode === "string" ? node.attrs.writtenMode : "lines";
    if (writtenMode === "blank") {
      const percent =
        typeof node.attrs?.writtenHeightPercent === "number" ? node.attrs.writtenHeightPercent : 20;
      // No page-height concept exists in Pandoc markdown output — this is
      // an APPROXIMATION, not a real percentage-of-page-height (that's
      // only achievable in the PDF/Typst export path, which bakes a
      // literal cm value client-side — see anvilnote-web's
      // question-item-node-view.tsx). Each blank paragraph is a
      // non-breaking space (`&nbsp;`), not truly empty text, so Pandoc
      // doesn't collapse/merge consecutive blank paragraphs into one.
      const blankParagraphCount = Math.max(1, Math.round(percent / 5));
      const blanks = Array.from({ length: blankParagraphCount }, () => "&nbsp;").join("\n\n");
      return [heading, blanks].join("\n\n");
    }
    const lines = typeof node.attrs?.writtenLines === "number" ? node.attrs.writtenLines : 3;
    // A paragraph of 3+ bare underscores is Pandoc's thematic-break
    // syntax (--from markdown+fenced_divs still has the default
    // "thematic_breaks" extension on, which this codebase legitimately
    // relies on elsewhere for horizontalRule nodes — see this file's own
    // `case "horizontalRule": return "---";`). Escaping each underscore
    // (`\_`) keeps it literal text instead — confirmed against a real
    // `pandoc -t native` run: unescaped renders as `HorizontalRule`,
    // escaped renders as `Para [Str "____...")]`.
    const rules = Array.from({ length: lines }, () => "\\_".repeat(40)).join("\n\n");
    return [heading, rules].join("\n\n");
  }

  // single: auto column layout. multi: 1 column by DEFAULT
  // (multiForceOneColumn, default true), or the same auto-column
  // heuristic if the user toggled it off — see renderChoices's own
  // comment.
  //
  // v3 (rich content): choices no longer live in node.attrs.choices
  // (a plain string[]) — they're a real "choiceList" child in this
  // questionItem's own content stream (after the body paragraph(s)).
  // `body` above already rendered it as "" (see the top-level
  // "choiceList" case below, same "rendered separately, empty string in
  // normal flow" pattern the renderer side's own choiceList case uses)
  // since it's rendered here explicitly instead.
  const choiceListChild = asNodes(node.content).find((child) => child.type === "choiceList");
  const forceOneColumn = kind === "multi" && node.attrs?.multiForceOneColumn !== false;
  const choicesMarkdown = choiceListChild
    ? renderChoices(choiceItemEntries(choiceListChild), forceOneColumn)
    : "";
  return [heading, choicesMarkdown].filter(Boolean).join("\n\n");
}

function renderBlock(node: TiptapNode): string {
  const type = typeof node.type === "string" ? node.type : "paragraph";

  switch (type) {
    case "heading": {
      const level = Math.min(Math.max(typeof node.attrs?.level === "number" ? node.attrs.level : 1, 1), 6);
      return `${"#".repeat(level)} ${inlineToMarkdown(node.content)}`.trim();
    }
    case "paragraph":
      return inlineToMarkdown(node.content);
    case "bulletList":
      return renderList(node, false);
    case "orderedList":
      return renderList(node, true);
    case "taskList":
      return renderTaskList(node);
    case "blockquote": {
      const inner = renderBlocks(asNodes(node.content));
      return inner
        ? inner
            .split("\n")
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n")
        : "";
    }
    case "callout":
      return renderCallout(node);
    case "question":
      return renderQuestion(node);
    case "questionItem":
      return renderQuestionItem(node);
    case "choiceList":
      // Rendered explicitly by questionItem's own case (via
      // choiceItemEntries/renderChoices) — NOT part of the normal
      // renderBlocks() flow, same "appears separately, empty string in
      // normal flow" pattern as the "footnotes" case below. Returning
      // non-empty here would double-render every choice (once here,
      // once via questionItem's explicit call).
      return "";
    case "proof": {
      // Unlike callout, proof has no color/kind to map to a Word style via
      // callout.lua's fenced-div handling — a plain Pandoc blockquote (the
      // same shape as this file's own "blockquote" case above) is enough,
      // Pandoc maps that to Word's built-in Quote style on its own.
      const label = `**${proofLabel(primaryLang)}**`;
      const inner = renderBlocks(asNodes(node.content));
      return [label, inner]
        .filter(Boolean)
        .join("\n\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    }
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const code = textContent(node.content);
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case "blockMath":
    case "math":
    case "equation": {
      const latex = attrLatex(node);
      return latex.trim() ? `$$\n${latex}\n$$` : "";
    }
    case "horizontalRule":
      return renderDivider(node);
    case "functionPlot": {
      const preview = typeof node.attrs?.preview === "string" ? node.attrs.preview : "";
      if (!preview) return "";
      // Word/Markdown can't embed a raw PDF — reuses the cached rasterized
      // PNG preview (the same one the editor's NodeView displays), not the
      // vector `pdf` attr the Typst exporter uses. renderImage only ever
      // reads node.attrs.src, so this just aliases preview into that field
      // rather than duplicating its body.
      return renderImage({ ...node, attrs: { ...node.attrs, src: preview } });
    }
    case "image":
      return renderImage(node);
    case "imageRow":
      // No side-by-side layout primitive in Pandoc Markdown either —
      // degrades to each sub-image rendered the same as a plain standalone
      // one, one after another (same fallback pattern as callout's own
      // Markdown case here).
      return asNodes(node.content)
        .map((child) => renderImage(child))
        .filter(Boolean)
        .join("\n\n");
    case "table":
      return canRenderTableAsOoxml(node) ? renderTableOoxml(node) : renderTableMarkdown(node);
    case "hardBreak":
      return "";
    case "footnotes":
      // The trailing footnotes list is never rendered as a visible block —
      // its content is emitted as `[^N]: ...` definitions appended at the
      // end (see tiptapToPandocMarkdown), Pandoc's native footnote syntax.
      return "";
    default:
      return inlineToMarkdown(node.content);
  }
}

function renderBlocks(nodes: TiptapNode[]): string {
  return nodes
    .map((node) => renderBlock(node ?? {}))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

// Builds data-id -> rendered-content for every `footnote` node under the
// doc's trailing `footnotes` list (tiptap-footnotes always nests them one
// level: footnotes > footnote > paragraph+).
function buildFootnoteContentMap(nodes: TiptapNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const footnotesNode = nodes.find((node) => node.type === "footnotes");
  for (const footnote of asNodes(footnotesNode?.content)) {
    const id = footnote.attrs?.["data-id"];
    if (typeof id === "string") {
      map.set(id, renderBlocks(asNodes(footnote.content)).replace(/\n+/g, " ").trim());
    }
  }
  return map;
}

/** Convert a Tiptap `doc` node to Pandoc-flavored Markdown. */
export function tiptapToPandocMarkdown(doc: TiptapNode, docPrimaryLang?: string): string {
  const nodes = asNodes(doc.content);
  footnoteContentById = buildFootnoteContentMap(nodes);
  footnoteDefs = [];
  primaryLang = docPrimaryLang;
  questionCounter = 0;

  const body = renderBlocks(nodes);
  const defs = footnoteDefs.map(([label, content]) => `[^${label}]: ${content}`).join("\n\n");

  footnoteContentById = null;
  footnoteDefs = null;
  primaryLang = undefined;

  return defs ? `${body}\n\n${defs}` : body;
}
