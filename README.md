# AnvilNote DOCX Exporter

`anvilnote-docx-exporter` is the DOCX conversion CLI used by AnvilNote. It accepts the current AnvilNote Tiptap document JSON and produces a Word `.docx` file. `anvilnote-api` invokes the built CLI, and AnvilNote Desktop packages it with a pinned Pandoc executable.

The exporter is deliberately separate from the Web editor, API, and PDF renderer. Its CLI contract lets those components request an export without depending on its conversion internals. It does not handle OpenAI API keys or call AI providers.

## How it works

```text
Tiptap document JSON
  -> Pandoc-flavored Markdown and targeted OOXML
  -> callout Lua filter and reference DOCX
  -> Pandoc
  -> Word DOCX
```

Pandoc converts inline and display math to native Word OMML equation objects. Callouts use `assets/callout.lua` and the paragraph styles in `assets/reference.docx`. The exporter emits targeted OOXML where the Markdown representation would lose table structure or layout details.

## Supported document content

The current converter includes:

- Paragraphs, headings, lists, blockquotes, code blocks, and horizontal rules
- Text marks and links from the accepted editor document
- Native Word tables, including supported row and column spans
- Inline and display math through OMML
- Images and image rows
- Callouts
- Proof blocks with localized proof labels and QED
- Single-choice, multiple-choice, and written-response questions
- Footnotes and resolved cross-references

The input is Tiptap JSON, not the provider-facing Smart Mode wire format. AI-generated content is exported only after it has passed validation and has been accepted into an AnvilNote document.

## Requirements

For standalone source development:

- Node.js and pnpm
- [Pandoc](https://pandoc.org/) on `PATH`, or a custom executable supplied through `PANDOC_BIN`

For example, on macOS:

```bash
brew install pandoc
```

Packaged AnvilNote Desktop releases include Pandoc. Desktop users do not need to install it separately.

## Setup and usage

```bash
pnpm install
pnpm build
node dist/cli.js --input document.json --output out.docx
```

`document.json` contains a title, an unwrapped Tiptap `doc` node, and an optional primary language:

```json
{
  "title": "My Note",
  "primaryLang": "en",
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "Hello from AnvilNote"
          }
        ]
      }
    ]
  }
}
```

The CLI writes one JSON result to `stdout`.

Success:

```json
{
  "ok": true,
  "status": "COMPLETED",
  "docxPath": "out.docx",
  "logs": []
}
```

Failure:

```json
{
  "ok": false,
  "status": "FAILED",
  "error": {
    "message": "Export failed",
    "details": "..."
  },
  "logs": []
}
```

## Application integration

In source development, `anvilnote-api` expects the Desktop-compatible bundle at `dist/cli.cjs`:

```bash
pnpm build:desktop
```

The API then exposes the document export through `POST /api/documents/:id/export/docx`. AnvilNote Desktop's preparation step builds and stages this exporter together with the API and other sibling components.

## Reference document

Callout colors and Word paragraph styles are defined by `scripts/build-reference-docx.ts`, `assets/callout.lua`, and the committed `assets/reference.docx`. If the shared callout palette changes, update the mirrored configuration and regenerate the reference file:

```bash
pnpm assets:build-reference
```

The reference document is a committed build asset. It is not regenerated for each export.

## Commands

```bash
pnpm build
pnpm build:desktop
pnpm lint
pnpm test
pnpm assets:build-reference
```

The `export` and `start` scripts require the `--input` and `--output` arguments
shown under [Setup and usage](#setup-and-usage).

## Known limitations

- Apple Pages has incomplete support for Word OMML and may display native equations as blank. Verify equation output in Microsoft Word or LibreOffice.
- Features that have no equivalent in DOCX may use a documented fallback rather than matching the editor pixel for pixel.

## Related repositories

- [AnvilNote API](https://github.com/AnvilNote/anvilnote-api) invokes the exporter CLI.
- [AnvilNote Desktop](https://github.com/AnvilNote/anvilnote-desktop) packages the exporter and Pandoc.
- [AnvilNote Web](https://github.com/AnvilNote/anvilnote-web) produces the Tiptap input document.
- [AnvilNote Renderer](https://github.com/AnvilNote/anvilnote-renderer) handles the separate Typst/PDF path.

## License

This repository is licensed under the [MIT License](LICENSE).
