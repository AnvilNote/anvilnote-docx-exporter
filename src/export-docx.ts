import { tiptapToPandocMarkdown } from "./markdown/tiptap-to-pandoc-markdown.js";
import { markdownToDocx } from "./pandoc/pandoc.js";
import type { ExportDocxInput } from "./types.js";

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Converts an AnvilNote document (title + Tiptap `doc` node) to a .docx
 * buffer. `assetsDir` must point at the directory containing callout.lua and
 * reference.docx (see pandoc.ts for why the caller resolves this, not us).
 */
export async function exportTiptapToDocx(
  input: ExportDocxInput,
  assetsDir: string,
): Promise<Buffer> {
  const body = tiptapToPandocMarkdown(input.content, input.primaryLang);
  const frontmatter = `---\ntitle: "${escapeYaml(input.title || "Untitled")}"\n---\n\n`;
  return markdownToDocx(frontmatter + body, assetsDir);
}

export { tiptapToPandocMarkdown } from "./markdown/tiptap-to-pandoc-markdown.js";
export { PandocError } from "./pandoc/pandoc.js";
export type { ExportDocxInput, TiptapNode } from "./types.js";
