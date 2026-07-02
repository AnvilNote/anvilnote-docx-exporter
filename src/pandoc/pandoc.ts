import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export class PandocError extends Error {
  constructor(
    message: string,
    readonly details?: string,
  ) {
    super(message);
    this.name = "PandocError";
  }
}

const PANDOC_BIN = process.env.PANDOC_BIN ?? "pandoc";
const PANDOC_TIMEOUT_MS = 30_000;

/**
 * Converts Pandoc-flavored Markdown (see tiptapToPandocMarkdown) to a .docx
 * buffer. `assetsDir` must point at the directory containing callout.lua and
 * reference.docx — resolved by the caller (src/cli.ts), not computed here via
 * import.meta.url: esbuild collapses every bundled module's import.meta.url
 * to the single output file's location, so a path computed relative to *this*
 * file would be correct unbundled (tsx) but wrong once bundled into dist/cli.js.
 */
export async function markdownToDocx(markdown: string, assetsDir: string): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "anvilnote-docx-"));
  const inputPath = path.join(workDir, "input.md");
  const outputPath = path.join(workDir, "output.docx");

  try {
    await writeFile(inputPath, markdown, "utf8");
    await runPandoc(inputPath, outputPath, assetsDir);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function runPandoc(inputPath: string, outputPath: string, assetsDir: string): Promise<void> {
  const calloutFilterPath = path.join(assetsDir, "callout.lua");
  const referenceDocPath = path.join(assetsDir, "reference.docx");

  return new Promise((resolve, reject) => {
    const child = spawn(
      PANDOC_BIN,
      [
        inputPath,
        "--from",
        "markdown+fenced_divs",
        "--lua-filter",
        calloutFilterPath,
        "--reference-doc",
        referenceDocPath,
        "--mathml",
        "-o",
        outputPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new PandocError("Pandoc timed out"));
    }, PANDOC_TIMEOUT_MS);

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new PandocError(
            "Pandoc is not installed or not on PATH",
            "Install it (e.g. `brew install pandoc`) or set PANDOC_BIN to its path.",
          ),
        );
        return;
      }
      reject(new PandocError("Failed to start Pandoc", error.message));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new PandocError(`Pandoc exited with code ${code ?? "unknown"}`, stderr.trim() || undefined));
    });
  });
}
