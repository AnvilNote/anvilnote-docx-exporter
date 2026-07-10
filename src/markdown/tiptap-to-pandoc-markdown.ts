import type { TiptapMark, TiptapNode } from "../types.js";
import { formatCrossRefLabel } from "../config/cross-ref-labels.js";
import { proofLabel } from "../config/proof-labels.js";
import { choiceColumns } from "./question-choices.js";

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

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ");
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

function renderTable(node: TiptapNode): string {
  const rows = asNodes(node.content).filter((row) => row.type === "tableRow");
  if (rows.length === 0) return "";

  const firstCells = asNodes(rows[0].content);
  const hasHeader = firstCells.length > 0 && firstCells.every((cell) => cell.type === "tableHeader");
  const columns = firstCells.length || 1;

  const cellText = (cell: TiptapNode) =>
    escapeCell(renderBlocks(asNodes(cell.content)).replace(/\n+/g, " ").trim());

  const headerCells = hasHeader ? firstCells.map(cellText) : Array.from({ length: columns }, () => "");
  const bodyRows = hasHeader ? rows.slice(1) : rows;

  const lines = [
    `| ${headerCells.join(" | ")} |`,
    `| ${headerCells.map(() => "---").join(" | ")} |`,
  ];
  for (const row of bodyRows) {
    const cells = asNodes(row.content).map(cellText);
    lines.push(`| ${cells.join(" | ")} |`);
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

function renderCallout(node: TiptapNode): string {
  const kind = typeof node.attrs?.kind === "string" ? node.attrs.kind : "note";
  const title = typeof node.attrs?.title === "string" ? node.attrs.title.trim() : "";
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
  const inner = renderBlocks(asNodes(node.content));
  return `::: {.callout .${kind}${titleAttr}}\n${inner}\n:::`;
}

// choices() renders as a Pandoc pipe table when choiceColumns() says
// more than 1 column — GFM tables are what Pandoc maps onto a real Word
// table (matching the PDF/Typst side's grid() layout at that point);
// 1 column instead renders as a plain line-per-choice list, matching
// anvilnote-renderer's own choices() Typst function taking the same
// branch. The last row is padded with empty cells if the option count
// doesn't divide evenly into the column count.
const CHOICE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function renderChoices(choices: string[]): string {
  const nonEmpty = choices.filter((c) => c.trim() !== "");
  if (nonEmpty.length === 0) return "";
  const labeled = nonEmpty.map((c, i) => `(${CHOICE_LABELS[i] ?? i + 1}) ${c}`);
  const columns = choiceColumns(nonEmpty);

  if (columns === 1) {
    return labeled.join("\n\n");
  }

  const rows: string[][] = [];
  for (let i = 0; i < labeled.length; i += columns) {
    const row = labeled.slice(i, i + columns);
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

function renderQuestion(node: TiptapNode): string {
  questionCounter += 1;
  const choices = Array.isArray(node.attrs?.choices)
    ? (node.attrs.choices as unknown[]).filter((c): c is string => typeof c === "string")
    : [];
  const body = renderBlocks(asNodes(node.content));
  const choicesMarkdown = renderChoices(choices);
  return [`**${questionCounter}.** ${body}`, choicesMarkdown]
    .filter(Boolean)
    .join("\n\n");
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
      return "---";
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
      return renderTable(node);
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
