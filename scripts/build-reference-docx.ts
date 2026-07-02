// Generates assets/reference.docx — the Pandoc `--reference-doc` template
// that defines every Word paragraph style callout.lua maps fenced divs onto,
// plus the document's default fonts. Run this whenever the callout palette
// (anvilnote-web/src/config/callouts.ts) or the font choice changes; the
// output is a committed binary asset, not built at export time.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
} from "docx";

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, "..", "assets", "reference.docx");

// Mirrors anvilnote-web/src/config/callouts.ts's 12 kinds (id -> accent/bg).
const CALLOUT_KINDS: Record<string, { accent: string; bg: string }> = {
  Note: { accent: "448AFF", bg: "E5ECF8" },
  Abstract: { accent: "00B0FF", bg: "DEF0F8" },
  Info: { accent: "00B8D4", bg: "DEF1F4" },
  Tip: { accent: "00BFA5", bg: "DEF1EF" },
  Success: { accent: "01C853", bg: "DEF2E6" },
  Question: { accent: "64DD17", bg: "E8F5E0" },
  Warning: { accent: "FF9100", bg: "F8EDDE" },
  Failure: { accent: "FF5252", bg: "F8E6E6" },
  Danger: { accent: "FF1744", bg: "F8E0E5" },
  Bug: { accent: "F50057", bg: "F7DEE7" },
  Example: { accent: "7C4DFF", bg: "EBE6F8" },
  Quote: { accent: "9E9E9E", bg: "EEEEEE" },
};

const BODY_TEXT_COLOR = "1F2328";
const ASCII_FONT = "Avenir Next";
const EASTASIA_FONT = "PingFang TC";

function calloutStyles() {
  return Object.entries(CALLOUT_KINDS).flatMap(([kind, { accent, bg }]) => [
    {
      id: `Callout${kind}`,
      name: `Callout${kind}`,
      basedOn: "Normal",
      next: "Normal",
      run: { font: ASCII_FONT, size: 21, color: BODY_TEXT_COLOR },
      paragraph: {
        shading: { type: ShadingType.CLEAR, fill: bg, color: "auto" },
        border: {
          left: { style: BorderStyle.SINGLE, size: 24, space: 8, color: accent },
        },
        indent: { left: 260, right: 200 },
        spacing: { before: 20, after: 100 },
      },
    },
    {
      id: `CalloutTitle${kind}`,
      name: `CalloutTitle${kind}`,
      basedOn: "Normal",
      next: "Normal",
      run: { font: ASCII_FONT, size: 22, bold: true, color: accent },
      paragraph: {
        shading: { type: ShadingType.CLEAR, fill: bg, color: "auto" },
        border: {
          left: { style: BorderStyle.SINGLE, size: 24, space: 8, color: accent },
        },
        indent: { left: 260, right: 200 },
        spacing: { before: 100, after: 20 },
      },
    },
  ]);
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: ASCII_FONT, size: 22, color: BODY_TEXT_COLOR },
      },
      title: { run: { font: ASCII_FONT, bold: true, size: 44 } },
      heading1: { run: { font: ASCII_FONT, bold: true, size: 32 } },
      heading2: { run: { font: ASCII_FONT, bold: true, size: 27 } },
      heading3: { run: { font: ASCII_FONT, bold: true, size: 24 } },
    },
    paragraphStyles: calloutStyles(),
  },
  sections: [
    {
      children: [
        new Paragraph({ text: "AnvilNote DOCX reference template", heading: HeadingLevel.TITLE }),
        new Paragraph({
          children: [
            new TextRun(
              "This file only supplies styles for Pandoc's --reference-doc; its body text is not used.",
            ),
          ],
        }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(outPath, buffer);
console.log(`wrote ${outPath} with ${Object.keys(CALLOUT_KINDS).length} callout kinds`);
