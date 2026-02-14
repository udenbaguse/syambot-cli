import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runProjectCommand } from "./command-runner.js";

const CWD = process.cwd();

function cleanPath(raw) {
  return String(raw || "").trim().replace(/^['"]|['"]$/g, "");
}

function resolveSafePath(inputPath) {
  const normalized = cleanPath(inputPath);
  if (!normalized) throw new Error("Path kosong.");

  const resolved = path.resolve(CWD, normalized);
  const rel = path.relative(CWD, resolved);
  const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));

  if (!inside) {
    throw new Error(`Path di luar project tidak diizinkan: ${normalized}`);
  }

  return resolved;
}

function parseOperations(answerText) {
  const operations = [];
  const fileRegex = /```(syambot-file|syambot-delete)\s+path=([^\n]+)\n([\s\S]*?)```/g;
  const cmdRegex = /```syambot-cmd\s*\n([\s\S]*?)```/g;

  let match;
  while ((match = fileRegex.exec(answerText)) !== null) {
    const kind = match[1];
    const pathArg = cleanPath(match[2]);
    const body = match[3] ?? "";

    if (kind === "syambot-file") {
      operations.push({ type: "write", path: pathArg, content: body.replace(/\n$/, "") });
    } else {
      operations.push({ type: "delete", path: pathArg });
    }
  }

  while ((match = cmdRegex.exec(answerText)) !== null) {
    const lines = (match[1] || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    for (const line of lines) {
      operations.push({ type: "command", command: line });
    }
  }

  return operations;
}

async function applyAiActions(answerText, options = {}) {
  const cwdPath = options.cwdPath || CWD;
  const executeCommands = Boolean(options.executeCommands);
  const operations = parseOperations(answerText);
  const applied = [];

  for (const op of operations) {
    if (op.type === "command") {
      if (!executeCommands) continue;
      await runProjectCommand(op.command, cwdPath);
      applied.push(`COMMAND ${op.command}`);
      continue;
    }

    const target = resolveSafePath(op.path);

    if (op.type === "write") {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, op.content, "utf8");
      applied.push(`WRITE ${path.relative(CWD, target).replace(/\\/g, "/")}`);
      continue;
    }

    await rm(target, { recursive: true, force: false });
    applied.push(`DELETE ${path.relative(CWD, target).replace(/\\/g, "/")}`);
  }

  return { operations, applied };
}

function buildApplyInstruction() {
  return [
    "Jika perlu membuat/mengubah file project, kembalikan patch dalam format ini (boleh lebih dari satu blok):",
    "```syambot-file path=relative/path/file.ext",
    "<isi file lengkap setelah perubahan>",
    "```",
    "",
    "Jika perlu hapus file/folder, gunakan:",
    "```syambot-delete path=relative/path",
    "```",
    "",
    "Jika perlu jalankan command terminal aman (contoh install package), gunakan:",
    "```syambot-cmd",
    "npm install express",
    "```",
    "",
    "Gunakan path relatif dari root project."
  ].join("\n");
}

export { applyAiActions, buildApplyInstruction };
