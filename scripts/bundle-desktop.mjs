// Bundle the CLI into a single self-contained dist/cli.js so the desktop app
// can run it under Electron's Node runtime with NO external node_modules
// (mirrors anvilnote-renderer's scripts/bundle-desktop.mjs). ESM format
// because this package is "type": "module" — dist/cli.js is loaded as ESM
// the same way src/cli.ts is under tsx, so relative-path resolution (see
// src/cli.ts's assetsDir) behaves identically bundled or not.
import { build } from "esbuild";
import { chmod } from "node:fs/promises";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "dist/cli.js",
  legalComments: "none",
  logLevel: "info",
});

await chmod("dist/cli.js", 0o755);
console.log("bundled dist/cli.js (standalone — no node_modules required at runtime)");
