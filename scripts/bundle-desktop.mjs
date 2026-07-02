// Bundle the CLI into a single self-contained dist/cli.cjs so the desktop
// app can run it under Electron's Node runtime with NO external
// node_modules (mirrors anvilnote-renderer's scripts/bundle-desktop.mjs).
//
// CJS format, and — importantly — the .cjs extension, not .js: this package
// is "type": "module" (so plain .js here is ESM), but the desktop app's
// docx-exporter/ resource dir ships dist/ only, no package.json, so Node
// would resolve a plain .js there as CommonJS by nearest-package.json
// default. A CJS-format bundle named cli.js is therefore ESM in this repo
// but CJS once copied — inconsistent, and broke in each direction in turn.
// .cjs sidesteps the ambiguity entirely: Node always treats it as CommonJS,
// regardless of any package.json "type" field, here or in the desktop app.
import { build } from "esbuild";
import { chmod } from "node:fs/promises";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/cli.cjs",
  legalComments: "none",
  logLevel: "info",
});

await chmod("dist/cli.cjs", 0o755);
console.log("bundled dist/cli.cjs (standalone — no node_modules required at runtime)");
