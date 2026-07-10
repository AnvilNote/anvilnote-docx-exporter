import { test } from "node:test";
import assert from "node:assert/strict";
import { tiptapToPandocMarkdown } from "./tiptap-to-pandoc-markdown.js";

test("renders a question with 4 short choices as a 4-column pipe table", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        attrs: { choices: ["go", "goes", "going", "gone"] },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Choose the correct answer." }],
          },
        ],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.match(md, /^\*\*1\.\*\* Choose the correct answer\./m);
  assert.match(md, /\(A\) go \| \(B\) goes \| \(C\) going \| \(D\) gone/);
});

test("renders a question with long choices as a single-column list, no table", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        attrs: {
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
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.doesNotMatch(md, /\|/);
  assert.match(md, /\(A\) a fairly long English phrase here/);
  assert.match(md, /\(D\) and a fourth verbose one indeed/);
});

test("numbers multiple questions continuously in document order", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "question",
        attrs: { choices: ["a", "b"] },
        content: [{ type: "paragraph", content: [{ type: "text", text: "First." }] }],
      },
      {
        type: "question",
        attrs: { choices: ["c", "d"] },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Second." }] }],
      },
    ],
  };
  const md = tiptapToPandocMarkdown(doc);
  assert.match(md, /\*\*1\.\*\* First\./);
  assert.match(md, /\*\*2\.\*\* Second\./);
});
