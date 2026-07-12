import { test } from "node:test";
import assert from "node:assert/strict";
import { tiptapToPandocMarkdown } from "./tiptap-to-pandoc-markdown.js";

// v3 (rich content): choices are no longer a plain attrs.choices:
// string[] — they're real content, a trailing "choiceList" child in a
// questionItem's own content stream, holding one or more "choiceItem"
// nodes each wrapping exactly one paragraph/image/blockMath. This
// helper builds that shape from plain option strings so the
// pre-existing tests below (originally written against the old
// attrs.choices shape) keep testing the same scenarios under the new
// content shape.
function textChoiceList(options: string[]) {
  return {
    type: "choiceList",
    content: options.map((text) => ({
      type: "choiceItem",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    })),
  };
}

test("renders a single-choice item with 4 short choices as a 4-column pipe table", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "single" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Choose the correct answer." }] },
              textChoiceList(["go", "goes", "going", "gone"]),
            ],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.match(md, /^\*\*1\.\*\* Choose the correct answer\./m);
  assert.match(md, /\(A\) go \| \(B\) goes \| \(C\) going \| \(D\) gone/);
});

test("renders a multi-choice item with SHORT choices as a single-column list anyway — multi always forces 1 column", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "multi" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Choose all that apply." }] },
              textChoiceList(["go", "goes", "going", "gone"]),
            ],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.doesNotMatch(md, /\|/);
  // Each 1-column choice line is a raw OOXML paragraph carrying explicit
  // space-before (see renderChoiceLine's own comment for why this isn't
  // a custom-style Div) — not a bare blank-line-separated list.
  assert.match(md, /w:spacing w:before="176"/);
  assert.match(md, /\(A\) <\/w:t><\/w:r><w:r><w:t xml:space="preserve">go<\/w:t>/);
  assert.match(md, /\(D\) <\/w:t><\/w:r><w:r><w:t xml:space="preserve">gone<\/w:t>/);
});

test("renders a multi-choice item with long choices as a single-column list, no table", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "multi" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Pick one." }] },
              textChoiceList([
                "a fairly long English phrase here",
                "another quite long option to pick",
                "a third long-ish choice of text",
                "and a fourth verbose one indeed",
              ]),
            ],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.doesNotMatch(md, /\|/);
  assert.match(md, /a fairly long English phrase here/);
  assert.match(md, /and a fourth verbose one indeed/);
});

test("numbers items continuously across multiple items in one block and across blocks", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "single" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "First." }] },
              textChoiceList(["a", "b"]),
            ],
          },
          {
            type: "questionItem",
            attrs: { kind: "single" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Second." }] },
              textChoiceList(["c", "d"]),
            ],
          },
        ],
      },
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "single" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Third." }] },
              textChoiceList(["e", "f"]),
            ],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.match(md, /\*\*1\.\*\* First\./);
  assert.match(md, /\*\*2\.\*\* Second\./);
  assert.match(md, /\*\*3\.\*\* Third\./);
});

test("renders a choiceList with a bold text choice, an image choice, and an equation choice", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "single" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Mixed choices." }] },
              {
                type: "choiceList",
                content: [
                  {
                    type: "choiceItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "bold one", marks: [{ type: "bold" }] }],
                      },
                    ],
                  },
                  {
                    type: "choiceItem",
                    content: [{ type: "image", attrs: { src: "data:image/png;base64,AAAA" } }],
                  },
                  {
                    type: "choiceItem",
                    content: [{ type: "blockMath", attrs: { latex: "x^2" } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.match(md, /\*\*bold one\*\*/);
  // Exact image/math markdown shape depends on this repo's existing
  // image/math rendering conventions — assert their PRESENCE (some
  // recognizable marker), not an exact string.
  assert.match(md, /\(A\)/);
  assert.match(md, /\(B\)/);
  assert.match(md, /\(C\)/);
  assert.match(md, /data:image\/png;base64,AAAA/);
  assert.match(md, /x\^2/);
});

test("renders a written/lines item as N underscore rules, no choices", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "written", writtenMode: "lines", writtenLines: 2 },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Short answer." }] }],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.match(md, /\*\*1\.\*\* Short answer\./);
  // Escaped underscores (\_), not bare ones — bare "_"*3+ alone on a line
  // is Pandoc's thematic-break syntax and would vanish as an <hr> in the
  // real docx (caught via manual verification against real Pandoc
  // output, see this feature's plan doc); escaping keeps it literal text.
  const underscoreLines = md.split("\n\n").filter((block) => /^(\\_)+$/.test(block.trim()));
  assert.equal(underscoreLines.length, 2);
});

test("renders a written/blank item as a small number of blank paragraphs proportional to the percent", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "written", writtenMode: "blank", writtenHeightPercent: 20 },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Essay." }] }],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.match(md, /\*\*1\.\*\* Essay\./);
  // 20% -> round(20/5) = 4 blank paragraphs, each rendered as a
  // non-breaking-space paragraph (see implementation) so Pandoc doesn't
  // collapse them.
  const blankParagraphs = md.split("\n\n").filter((block) => block.trim() === "&nbsp;");
  assert.equal(blankParagraphs.length, 4);
});

test("falls back to Pandoc table markup instead of dropping rich cell content", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Math" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "inlineMath", attrs: { latex: "x^2" } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const markdown = tiptapToPandocMarkdown(doc);
  assert.match(markdown, /\$x\^2\$/);
  assert.doesNotMatch(markdown, /```\{=openxml\}/);
});
