import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const IGNORE_DIRS = new Set([".git", "node_modules", ".syambot"]);
const IGNORE_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

function isTextContent(content) {
  return !content.includes("\u0000");
}

async function collectFiles(rootDir, dir, out, maxFiles) {
  if (out.length >= maxFiles) return;

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (out.length >= maxFiles) return;

    const abs = path.join(dir, entry.name);
    const rel = path.relative(rootDir, abs).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      await collectFiles(rootDir, abs, out, maxFiles);
      continue;
    }

    if (!entry.isFile()) continue;
    if (IGNORE_FILES.has(entry.name)) continue;

    out.push({ abs, rel });
  }
}

async function buildProjectContext(rootDir, options = {}) {
  const maxFiles = options.maxFiles ?? 40;
  const maxFileChars = options.maxFileChars ?? 2500;
  const maxTotalChars = options.maxTotalChars ?? 25000;

  const files = [];
  await collectFiles(rootDir, rootDir, files, maxFiles);

  const header = [
    `Project root: ${rootDir}`,
    "",
    "Project files:",
    ...files.map((f) => `- ${f.rel}`),
    "",
    "File snippets:"
  ];

  const chunks = [header.join("\n")];
  let used = chunks[0].length;

  for (const file of files) {
    if (used >= maxTotalChars) break;

    try {
      const raw = await readFile(file.abs, "utf8");
      if (!isTextContent(raw)) continue;

      const clipped = raw.length > maxFileChars ? `${raw.slice(0, maxFileChars)}\n...<truncated>` : raw;
      const section = `\n### ${file.rel}\n\n\`\`\`text\n${clipped}\n\`\`\``;

      if (used + section.length > maxTotalChars) break;
      chunks.push(section);
      used += section.length;
    } catch {
      // Ignore unreadable file.
    }
  }

  return chunks.join("\n");
}

async function buildProjectTree(rootDir, options = {}) {
  const maxFiles = options.maxFiles ?? 120;
  const files = [];
  await collectFiles(rootDir, rootDir, files, maxFiles);

  return [
    `Project root: ${rootDir}`,
    "",
    "Project files:",
    ...files.map((f) => `- ${f.rel}`)
  ].join("\n");
}

export { buildProjectContext, buildProjectTree };
