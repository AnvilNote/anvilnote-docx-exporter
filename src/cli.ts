#!/usr/bin/env node
// CLI entry point. Contract mirrors anvilnote-renderer's cli.js so
// anvilnote-api can shell out to both the same way:
//   tsx src/cli.ts --input <path-to-json> --output <path-to-docx>
// stdin/stdout stay clean; the result is a single JSON line on stdout:
//   { ok: true, status: "COMPLETED", docxPath, logs }
//   { ok: false, status: "FAILED", error: { message, details? }, logs }
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { exportTiptapToDocx } from "./export-docx.js";
import { PandocError } from "./pandoc/pandoc.js";

// This file (src/cli.ts unbundled, or dist/cli.js after esbuild bundling to
// CJS for the desktop app) always sits exactly one level below the repo
// root in both layouts, so "assets" is a sibling of its parent directory
// either way. __dirname is a real CJS global (what the bundled dist/cli.js
// runs as); import.meta.url only resolves under tsx's ESM dev mode — esbuild
// leaves it empty when bundling to CJS, it does not shim it.
const hereDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(hereDir, "..", "assets");

const tiptapNodeSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

const inputSchema = z.object({
  title: z.string().default("Untitled"),
  content: tiptapNodeSchema,
});

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logs: string[] = [];

  if (!args.input || !args.output) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        status: "FAILED",
        error: { message: "Missing required --input and/or --output" },
        logs,
      }),
    );
    process.exitCode = 1;
    return;
  }

  try {
    const raw = await readFile(args.input, "utf8");
    const input = inputSchema.parse(JSON.parse(raw));
    logs.push(`Read input from ${args.input}`);

    const docx = await exportTiptapToDocx(input, assetsDir);
    await writeFile(args.output, docx);
    logs.push(`Wrote ${docx.length} bytes to ${args.output}`);

    process.stdout.write(
      JSON.stringify({ ok: true, status: "COMPLETED", docxPath: args.output, logs }),
    );
  } catch (error) {
    const message =
      error instanceof PandocError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown error";
    const details = error instanceof PandocError ? error.details : undefined;

    process.stdout.write(
      JSON.stringify({ ok: false, status: "FAILED", error: { message, details }, logs }),
    );
    process.exitCode = 1;
  }
}

void main();
