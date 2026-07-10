import { test } from "node:test";
import assert from "node:assert/strict";
import { tiptapToPandocMarkdown } from "./tiptap-to-pandoc-markdown.js";

test("renders a single-choice item with 4 short choices as a 4-column pipe table", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "single", choices: ["go", "goes", "going", "gone"] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Choose the correct answer." }] }],
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
            attrs: { kind: "multi", choices: ["go", "goes", "going", "gone"] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Choose all that apply." }] }],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.doesNotMatch(md, /\|/);
  assert.match(md, /\(A\) go\n\n\(B\) goes\n\n\(C\) going\n\n\(D\) gone/);
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
            attrs: {
              kind: "multi",
              choices: [
                "a fairly long English phrase here",
                "another quite long option to pick",
                "a third long-ish choice of text",
                "and a fourth verbose one indeed",
              ],
            },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Pick one." }] }],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.doesNotMatch(md, /\|/);
  assert.match(md, /\(A\) a fairly long English phrase here/);
  assert.match(md, /\(D\) and a fourth verbose one indeed/);
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
            attrs: { kind: "single", choices: ["a", "b"] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "First." }] }],
          },
          {
            type: "questionItem",
            attrs: { kind: "single", choices: ["c", "d"] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Second." }] }],
          },
        ],
      },
      {
        type: "question",
        content: [
          {
            type: "questionItem",
            attrs: { kind: "single", choices: ["e", "f"] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Third." }] }],
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
