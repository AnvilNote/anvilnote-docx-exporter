import type { TiptapMark, TiptapNode } from "../types.js";

const TABLE_WIDTH_TWIPS = Math.round((21 - 2.54 * 2) * (1440 / 2.54));
const HEADER_ASCII_FONT = "Avenir Next";
const HEADER_EAST_ASIA_FONT = "PingFang TC";

type LogicalCell = {
  cell: TiptapNode;
  column: number;
  colspan: number;
  rowspan: number;
  continuation: boolean;
};

type LogicalRow = {
  node: TiptapNode;
  cells: LogicalCell[];
};

type ActiveSpan = {
  cell: TiptapNode;
  column: number;
  colspan: number;
  untilRow: number;
};

function asNodes(content: unknown): TiptapNode[] {
  return Array.isArray(content) ? (content as TiptapNode[]) : [];
}

function positiveSpan(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string" || !/^#[0-9a-f]{3,8}$/i.test(value)) return null;
  const raw = value.slice(1);
  const expanded = raw.length === 3 || raw.length === 4
    ? raw.slice(0, 3).split("").map((part) => part + part).join("")
    : raw.slice(0, 6);
  return expanded.toUpperCase();
}

function contrastTextColor(fill: string): "000000" | "FFFFFF" {
  const channel = (index: number) => {
    const value = parseInt(fill.slice(index * 2, index * 2 + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return luminance > 0.179 ? "000000" : "FFFFFF";
}

function lengthToTwips(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(0|\d+(?:\.\d+)?)(pt|px|em|rem)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = match[2] === "pt" ? 20 : match[2] === "px" ? 15 : 240;
  return Math.round(amount * multiplier);
}

function layoutRows(rows: TiptapNode[]) {
  const active: ActiveSpan[] = [];
  const logicalRows: LogicalRow[] = [];
  let columnCount = 1;

  rows.forEach((row, rowIndex) => {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].untilRow <= rowIndex) active.splice(index, 1);
    }

    const occupied = new Set<number>();
    const cells: LogicalCell[] = [];
    for (const span of active) {
      cells.push({
        cell: span.cell,
        column: span.column,
        colspan: span.colspan,
        rowspan: 1,
        continuation: true,
      });
      for (let column = span.column; column < span.column + span.colspan; column += 1) {
        occupied.add(column);
      }
    }

    let cursor = 0;
    for (const cell of asNodes(row.content)) {
      const colspan = positiveSpan(cell.attrs?.colspan);
      const rowspan = positiveSpan(cell.attrs?.rowspan);
      while (
        Array.from({ length: colspan }, (_, offset) => cursor + offset).some((column) =>
          occupied.has(column),
        )
      ) {
        cursor += 1;
      }
      cells.push({ cell, column: cursor, colspan, rowspan, continuation: false });
      for (let column = cursor; column < cursor + colspan; column += 1) {
        occupied.add(column);
      }
      if (rowspan > 1) {
        active.push({ cell, column: cursor, colspan, untilRow: rowIndex + rowspan });
      }
      cursor += colspan;
    }

    cells.sort((left, right) => left.column - right.column);
    columnCount = Math.max(columnCount, ...cells.map((cell) => cell.column + cell.colspan));
    logicalRows.push({ node: row, cells });
  });

  return { logicalRows, columnCount };
}

function columnWidths(logicalRows: LogicalRow[], columnCount: number): number[] {
  const weights: Array<number | null> = Array(columnCount).fill(null);
  for (const row of logicalRows) {
    for (const logical of row.cells) {
      if (logical.continuation) continue;
      const colwidth = Array.isArray(logical.cell.attrs?.colwidth)
        ? logical.cell.attrs.colwidth
        : [];
      for (let offset = 0; offset < logical.colspan; offset += 1) {
        const width = colwidth[offset];
        if (weights[logical.column + offset] === null && typeof width === "number" && width > 0) {
          weights[logical.column + offset] = width;
        }
      }
    }
  }

  const known = weights.filter((weight): weight is number => weight !== null);
  const fallback = known.length > 0
    ? known.reduce((sum, weight) => sum + weight, 0) / known.length
    : 1;
  const resolved = weights.map((weight) => weight ?? fallback);
  const totalWeight = resolved.reduce((sum, weight) => sum + weight, 0);
  let remaining = TABLE_WIDTH_TWIPS;
  return resolved.map((weight, index) => {
    if (index === resolved.length - 1) return remaining;
    const width = Math.round((TABLE_WIDTH_TWIPS * weight) / totalWeight);
    remaining -= width;
    return width;
  });
}

function runProperties(
  options: { header: boolean; color: string | null },
  marks: TiptapMark[] = [],
): string {
  const properties: string[] = [];
  if (options.header) {
    properties.push(
      `<w:rFonts w:ascii="${HEADER_ASCII_FONT}" w:hAnsi="${HEADER_ASCII_FONT}" w:eastAsia="${HEADER_EAST_ASIA_FONT}"/>`,
      "<w:b/>",
    );
  }
  if (marks.some((mark) => mark.type === "bold") && !options.header) properties.push("<w:b/>");
  if (marks.some((mark) => mark.type === "italic")) properties.push("<w:i/>");
  if (marks.some((mark) => mark.type === "underline")) properties.push('<w:u w:val="single"/>');
  if (marks.some((mark) => mark.type === "strike")) properties.push("<w:strike/>");
  if (options.color) properties.push(`<w:color w:val="${options.color}"/>`);
  return properties.length > 0 ? `<w:rPr>${properties.join("")}</w:rPr>` : "";
}

function inlineRuns(content: TiptapNode[], options: { header: boolean; color: string | null }): string {
  return content
    .map((node) => {
      if (node.type === "hardBreak") return `<w:r>${runProperties(options)}<w:br/></w:r>`;
      if (node.type === "inlineMath" || node.type === "math") {
        const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
        return latex
          ? `<w:r>${runProperties(options)}<w:t xml:space="preserve">${escapeXmlText(latex)}</w:t></w:r>`
          : "";
      }
      if (node.type !== "text" || typeof node.text !== "string" || !node.text) {
        return inlineRuns(asNodes(node.content), options);
      }

      const marks: TiptapMark[] = Array.isArray(node.marks) ? node.marks : [];
      return `<w:r>${runProperties(options, marks)}<w:t xml:space="preserve">${escapeXmlText(node.text)}</w:t></w:r>`;
    })
    .join("");
}

function horizontalAlignment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.split("+").map((part) => part.trim());
  return parts.find((part) => part === "left" || part === "center" || part === "right") ?? null;
}

function verticalAlignment(attrs: Record<string, unknown> | undefined): string | null {
  if (attrs?.verticalAlign === "middle") return "center";
  if (attrs?.verticalAlign === "top" || attrs?.verticalAlign === "bottom") {
    return attrs.verticalAlign;
  }
  if (typeof attrs?.align !== "string") return null;
  const parts = attrs.align.split("+").map((part) => part.trim());
  if (parts.includes("horizon")) return "center";
  if (parts.includes("bottom")) return "bottom";
  if (parts.includes("top")) return "top";
  return null;
}

function cellParagraphs(cell: TiptapNode, continuation: boolean): string {
  const header = cell.type === "tableHeader";
  const fill = normalizeHex(cell.attrs?.fill);
  const color = fill ? contrastTextColor(fill) : null;
  const align = horizontalAlignment(cell.attrs?.align);
  const pPr = align ? `<w:pPr><w:jc w:val="${align}"/></w:pPr>` : "<w:pPr/>";
  if (continuation) return `<w:p>${pPr}</w:p>`;

  const blocks = asNodes(cell.content);
  if (blocks.length === 0) return `<w:p>${pPr}</w:p>`;
  return blocks
    .map((block) => {
      if (block.type === "bulletList" || block.type === "orderedList" || block.type === "taskList") {
        const ordered = block.type === "orderedList";
        return asNodes(block.content)
          .map((item, index) => {
            const prefix = ordered ? `${index + 1}. ` : "• ";
            const runs = inlineRuns(asNodes(item.content), { header, color });
            return `<w:p>${pPr}<w:r>${runProperties({ header, color })}<w:t xml:space="preserve">${prefix}</w:t></w:r>${runs}</w:p>`;
          })
          .join("");
      }
      const runs = inlineRuns(asNodes(block.content), { header, color });
      return `<w:p>${pPr}${runs}</w:p>`;
    })
    .join("");
}

function cellProperties(logical: LogicalCell, widths: number[]): string {
  const { cell, column, colspan, rowspan, continuation } = logical;
  const parts: string[] = [];
  const cellWidth = widths.slice(column, column + colspan).reduce((sum, width) => sum + width, 0);
  parts.push(`<w:tcW w:type="dxa" w:w="${cellWidth}"/>`);
  if (colspan > 1) parts.push(`<w:gridSpan w:val="${colspan}"/>`);
  if (continuation) parts.push("<w:vMerge/>");
  else if (rowspan > 1) parts.push('<w:vMerge w:val="restart"/>');

  const stroke = normalizeHex(cell.attrs?.stroke);
  if (stroke) {
    const edge = (name: string) => `<w:${name} w:val="single" w:sz="4" w:space="0" w:color="${stroke}"/>`;
    parts.push(`<w:tcBorders>${edge("top")}${edge("left")}${edge("bottom")}${edge("right")}</w:tcBorders>`);
  }

  const fill = normalizeHex(cell.attrs?.fill);
  if (fill) parts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`);

  const inset = lengthToTwips(cell.attrs?.inset);
  if (inset !== null) {
    const margin = (name: string) => `<w:${name} w:w="${inset}" w:type="dxa"/>`;
    parts.push(`<w:tcMar>${margin("top")}${margin("left")}${margin("bottom")}${margin("right")}</w:tcMar>`);
  }

  const vertical =
    verticalAlignment(cell.attrs) ??
    (continuation || colspan > 1 || rowspan > 1 ? "center" : null);
  if (vertical) parts.push(`<w:vAlign w:val="${vertical}"/>`);
  return `<w:tcPr>${parts.join("")}</w:tcPr>`;
}

function tableBorders(): string {
  const edge = (name: string) => `<w:${name} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
  return `<w:tblBorders>${edge("top")}${edge("left")}${edge("bottom")}${edge("right")}${edge("insideH")}${edge("insideV")}</w:tblBorders>`;
}

export function renderTableOoxml(node: TiptapNode): string {
  const rows = asNodes(node.content).filter((row) => row.type === "tableRow");
  if (rows.length === 0) return "";

  const { logicalRows, columnCount } = layoutRows(rows);
  const widths = columnWidths(logicalRows, columnCount);
  const tableCellMargins =
    '<w:tblCellMar><w:top w:w="28" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar>';
  const tableProperties =
    `<w:tblPr><w:tblStyle w:val="Table"/><w:tblW w:type="pct" w:w="5000"/>${tableBorders()}<w:tblLayout w:type="fixed"/>${tableCellMargins}<w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0" w:val="0020"/></w:tblPr>`;
  const grid = `<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>`;

  const renderedRows = logicalRows
    .map((row, rowIndex) => {
      const realCells = row.cells.filter((cell) => !cell.continuation);
      const isHeader =
        rowIndex === 0 &&
        realCells.length > 0 &&
        realCells.every((logical) => logical.cell.type === "tableHeader");
      const rowProperties: string[] = [];
      if (isHeader) rowProperties.push("<w:tblHeader/>");
      const rowHeight = typeof row.node.attrs?.rowHeight === "number" ? row.node.attrs.rowHeight : null;
      if (rowHeight !== null && rowHeight > 0) {
        rowProperties.push(`<w:trHeight w:val="${Math.round(rowHeight * 15)}" w:hRule="atLeast"/>`);
      }
      if (row.cells.some((logical) => logical.cell.attrs?.breakable === false)) {
        rowProperties.push("<w:cantSplit/>");
      }
      const trPr = rowProperties.length > 0 ? `<w:trPr>${rowProperties.join("")}</w:trPr>` : "<w:trPr/>";
      const cells = row.cells
        .map(
          (logical) =>
            `<w:tc>${cellProperties(logical, widths)}${cellParagraphs(logical.cell, logical.continuation)}</w:tc>`,
        )
        .join("");
      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join("");

  return `\`\`\`{=openxml}\n<w:tbl>${tableProperties}${grid}${renderedRows}</w:tbl>\n\`\`\``;
}
