# anvilnote-docx-exporter

CLI service that converts an AnvilNote document (Tiptap JSON) to a Word
`.docx` file. Sibling repo to `anvilnote-renderer` (which does the same job
for Typst/PDF) — same shape, different engine, fully decoupled: this repo
has no dependency on `anvilnote-web`, `anvilnote-api`, or `anvilnote-renderer`,
and none of them depend on its internals either. `anvilnote-api` only shells
out to its built CLI, exactly like it does for the Typst renderer.

## How it works

```
Tiptap JSON (doc node)
  -> tiptapToPandocMarkdown()      Pandoc-flavored Markdown; callouts become
                                     fenced divs: ::: {.callout .note title="..."}
  -> pandoc (system binary)         --lua-filter assets/callout.lua maps
                                     fenced divs to Word paragraph styles
                                     --reference-doc assets/reference.docx
                                     supplies those styles + default fonts
  -> .docx buffer
```

Tables and math ($…$ / $$…$$) are native Pandoc Markdown and need no filter —
Pandoc converts math straight to Word's native equation objects (OMML).
Callouts are AnvilNote's own concept, so they're the one thing routed through
`assets/callout.lua` + `assets/reference.docx`.

## Requirements

- Node.js + pnpm
- [Pandoc](https://pandoc.org/) on `PATH` (or set `PANDOC_BIN` to its path).
  `brew install pandoc` on macOS.

## Usage

```sh
pnpm install
pnpm build
node dist/cli.js --input document.json --output out.docx
```

`document.json`:

```json
{ "title": "My Note", "content": { "type": "doc", "content": [...] } }
```

`content` is an AnvilDocument's `content` field — an unwrapped Tiptap `doc`
node, the same shape the editor already produces.

Output on stdout (mirrors `anvilnote-renderer`'s CLI contract, so
`anvilnote-api` can shell out to both the same way):

```json
{"ok":true,"status":"COMPLETED","docxPath":"out.docx","logs":[...]}
{"ok":false,"status":"FAILED","error":{"message":"...","details":"..."},"logs":[...]}
```

## Regenerating assets/reference.docx

The callout palette and default fonts are defined in
`scripts/build-reference-docx.ts` (mirrors
`anvilnote-web/src/config/callouts.ts`'s 12 kinds by hand — there's no shared
import, so if the web palette changes, update both and re-run):

```sh
pnpm assets:build-reference
```

The generated `assets/reference.docx` is committed as a binary asset; Pandoc
reads it directly at export time, it isn't rebuilt on every run.

## Known limitation

Apple Pages has poor support for Word's native OMML equation objects and may
render math as blank — this is a Pages limitation, not a bug here. Verify
math output in real Microsoft Word or LibreOffice.
