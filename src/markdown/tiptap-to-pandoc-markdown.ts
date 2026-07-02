import type { TiptapMark, TiptapNode } from "../types.js";

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
  return `![${caption}](${src})`;
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
    case "table":
      return renderTable(node);
    case "hardBreak":
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

/** Convert a Tiptap `doc` node to Pandoc-flavored Markdown. */
export function tiptapToPandocMarkdown(doc: TiptapNode): string {
  return renderBlocks(asNodes(doc.content));
}
