import { test } from "node:test";
import assert from "node:assert/strict";
import { choiceColumns, displayWidth, type ChoiceEntry } from "./question-choices.js";

function text(t: string): ChoiceEntry {
  return { kind: "text", text: t };
}

test("displayWidth counts ASCII as 1 and CJK as 2", () => {
  assert.equal(displayWidth("go"), 2);
  assert.equal(displayWidth("中"), 2);
  assert.equal(displayWidth("中文"), 4);
  assert.equal(displayWidth("a中"), 3);
});

test("choiceColumns picks 4 columns for short options", () => {
  assert.equal(choiceColumns([text("go"), text("goes"), text("going"), text("gone")]), 4);
});

test("choiceColumns picks 2 columns for medium CJK options", () => {
  assert.equal(
    choiceColumns([
      text("中等長度的選項一"),
      text("中等長度的選項二"),
      text("中等長度的選項三"),
      text("中等長度的選項四"),
    ]),
    2,
  );
});

test("choiceColumns picks 1 column for long options", () => {
  assert.equal(
    choiceColumns([
      text("a fairly long English phrase here"),
      text("another quite long option to pick"),
      text("a third long-ish choice of text"),
      text("and a fourth verbose one indeed"),
    ]),
    1,
  );
});

test("choiceColumns ignores empty options when averaging", () => {
  assert.equal(choiceColumns([text("go"), text("goes"), text(""), text("")]), 4);
});

test("choiceColumns defaults to 4 columns when every option is empty", () => {
  assert.equal(choiceColumns([text(""), text(""), text(""), text("")]), 4);
});

test("choiceColumns counts an image entry as the flat nominal width", () => {
  // A single image entry alone has nominal width 20. With only one slot,
  // the medium tier is capped to one column, matching Web and Renderer.
  assert.equal(choiceColumns([{ kind: "image" }]), 1);
});

test("choiceColumns counts a blockMath entry as the flat nominal width", () => {
  // A blockMath entry (nominal width 20) mixed with a medium text
  // choice still averages into 2 columns.
  assert.equal(choiceColumns([{ kind: "blockMath" }, text("medium option")]), 2);
});
