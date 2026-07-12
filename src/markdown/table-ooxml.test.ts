import assert from "node:assert/strict";
import test from "node:test";
import { renderTableOoxml } from "./table-ooxml.js";
import type { TiptapNode } from "../types.js";

const paragraph = (text = ""): TiptapNode => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});

test("renders equal default columns, auto rows, empty paragraphs, and sans headers", () => {
  const xml = renderTableOoxml({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableHeader", content: [paragraph("A")] },
          { type: "tableHeader", content: [paragraph("B")] },
        ],
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [paragraph()] },
          { type: "tableCell", content: [paragraph()] },
        ],
      },
    ],
  });

  assert.match(xml, /<w:tblW w:type="pct" w:w="5000"\/>/);
  assert.equal(xml.match(/<w:gridCol w:w="4513"\/>/g)?.length, 2);
  assert.doesNotMatch(xml, /w:trHeight/);
  assert.match(xml, /<w:tblHeader\/>/);
  assert.match(xml, /w:ascii="Avenir Next"/);
  assert.match(xml, /w:eastAsia="PingFang TC"/);
  assert.equal(xml.match(/<w:p><w:pPr\/><\/w:p>/g)?.length, 2);
});

test("renders manual column proportions and an at-least row height", () => {
  const xml = renderTableOoxml({
    type: "table",
    content: [
      {
        type: "tableRow",
        attrs: { rowHeight: 40 },
        content: [
          { type: "tableCell", attrs: { colwidth: [120] }, content: [paragraph("A")] },
          { type: "tableCell", attrs: { colwidth: [80] }, content: [paragraph("B")] },
        ],
      },
    ],
  });

  assert.match(xml, /<w:gridCol w:w="5416"\/><w:gridCol w:w="3610"\/>/);
  assert.match(xml, /<w:trHeight w:val="600" w:hRule="atLeast"\/>/);
});

test("renders colspan and rowspan with Word gridSpan and vMerge continuations", () => {
  const xml = renderTableOoxml({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colspan: 2, rowspan: 2 },
            content: [paragraph("Merged")],
          },
          { type: "tableCell", content: [paragraph("C1")] },
        ],
      },
      {
        type: "tableRow",
        content: [{ type: "tableCell", content: [paragraph("C2")] }],
      },
    ],
  });

  assert.equal(xml.match(/<w:gridSpan w:val="2"\/>/g)?.length, 2);
  assert.equal(xml.match(/<w:vMerge w:val="restart"\/>/g)?.length, 1);
  assert.equal(xml.match(/<w:vMerge\/>/g)?.length, 1);
  assert.match(xml, /<w:vMerge w:val="restart"\/><w:vAlign w:val="center"\/>/);
  assert.equal(xml.match(/<w:gridCol /g)?.length, 3);
});

test("renders supported cell attrs, row breakability, and dark-fill contrast", () => {
  const xml = renderTableOoxml({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: {
              align: "center",
              verticalAlign: "middle",
              fill: "#111111",
              stroke: "#abcdef",
              inset: "8pt",
              breakable: false,
              customAttribute: "must-not-export",
            },
            content: [paragraph("Styled")],
          },
        ],
      },
    ],
  });

  assert.match(xml, /<w:cantSplit\/>/);
  assert.match(xml, /<w:shd w:val="clear" w:color="auto" w:fill="111111"\/>/);
  assert.match(xml, /<w:tcBorders>.*w:color="ABCDEF".*<\/w:tcBorders>/);
  assert.match(xml, /<w:tcMar>.*w:w="160".*<\/w:tcMar>/);
  assert.match(xml, /<w:vAlign w:val="center"\/>/);
  assert.match(xml, /<w:jc w:val="center"\/>/);
  assert.match(xml, /<w:color w:val="FFFFFF"\/>/);
  assert.doesNotMatch(xml, /customAttribute|must-not-export/);
});

test("does not confuse horizontal center with vertical center", () => {
  const xml = renderTableOoxml({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { align: "center" },
            content: [paragraph("Centered")],
          },
        ],
      },
    ],
  });

  assert.match(xml, /<w:jc w:val="center"\/>/);
  assert.doesNotMatch(xml, /<w:vAlign/);
});

test("preserves known manual widths when another column has no colwidth", () => {
  const xml = renderTableOoxml({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableCell", attrs: { colwidth: [120] }, content: [paragraph("A")] },
          { type: "tableCell", content: [paragraph("B")] },
          { type: "tableCell", attrs: { colwidth: [80] }, content: [paragraph("C")] },
        ],
      },
    ],
  });

  assert.match(
    xml,
    /<w:gridCol w:w="3610"\/><w:gridCol w:w="3009"\/><w:gridCol w:w="2407"\/>/,
  );
});

test("emits table and cell properties in OOXML schema order", () => {
  const xml = renderTableOoxml({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { fill: "#eeeeee", stroke: "#111111" },
            content: [paragraph("A")],
          },
        ],
      },
    ],
  });

  assert.ok(xml.indexOf("<w:tblBorders>") < xml.indexOf("<w:tblLayout"));
  assert.ok(xml.indexOf("<w:tcBorders>") < xml.indexOf("<w:shd "));
});
