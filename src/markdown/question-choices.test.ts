import { test } from "node:test";
import assert from "node:assert/strict";
import { choiceColumns, displayWidth } from "./question-choices.js";

test("displayWidth counts ASCII as 1 and CJK as 2", () => {
  assert.equal(displayWidth("go"), 2);
  assert.equal(displayWidth("中"), 2);
  assert.equal(displayWidth("中文"), 4);
  assert.equal(displayWidth("a中"), 3);
});

test("choiceColumns picks 4 columns for short options", () => {
  assert.equal(choiceColumns(["go", "goes", "going", "gone"]), 4);
});

test("choiceColumns picks 2 columns for medium CJK options", () => {
  assert.equal(
    choiceColumns(["中等長度的選項一", "中等長度的選項二", "中等長度的選項三", "中等長度的選項四"]),
    2,
  );
});

test("choiceColumns picks 1 column for long options", () => {
  assert.equal(
    choiceColumns([
      "a fairly long English phrase here",
      "another quite long option to pick",
      "a third long-ish choice of text",
      "and a fourth verbose one indeed",
    ]),
    1,
  );
});

test("choiceColumns ignores empty options when averaging", () => {
  assert.equal(choiceColumns(["go", "goes", "", ""]), 4);
});

test("choiceColumns defaults to 4 columns when every option is empty", () => {
  assert.equal(choiceColumns(["", "", "", ""]), 4);
});
