import { spawn } from "node:child_process";

const BLOCKED_TOKENS = ["&&", "||", ";", "|", ">", "<", "rm ", "del ", "rmdir", "shutdown", "format "];
const ALLOWED_PREFIXES = [
  ["npm", "install"],
  ["npm", "i"],
  ["npm", "uninstall"],
  ["npm", "remove"],
  ["npm", "run"],
  ["pnpm", "install"],
  ["pnpm", "add"],
  ["pnpm", "remove"],
  ["pnpm", "run"],
  ["yarn", "install"],
  ["yarn", "add"],
  ["yarn", "remove"],
  ["yarn", "run"],
  ["bun", "install"],
  ["bun", "add"],
  ["bun", "remove"],
  ["bun", "run"],
  ["npx"],
  ["node"],
  ["git"],
  ["mkdir"],
  ["md"]
];

function normalizeCommand(command) {
  return String(command || "").trim().replace(/\s+/g, " ");
}

function isAllowedCommand(command) {
  const lower = normalizeCommand(command).toLowerCase();
  if (!lower) return false;
  if (BLOCKED_TOKENS.some((token) => lower.includes(token))) return false;

  const parts = lower.split(" ");
  return ALLOWED_PREFIXES.some((prefix) => prefix.every((p, idx) => parts[idx] === p));
}

async function runProjectCommand(command, cwdPath) {
  const normalized = normalizeCommand(command);
  if (!isAllowedCommand(normalized)) {
    throw new Error(
      `Command ditolak (tidak aman / tidak diizinkan): ${normalized}. ` +
      "Gunakan command tunggal tanpa &&, ;, |, >, < dan pakai prefix yang diizinkan (npm/pnpm/yarn/bun/npx/node/git/mkdir)."
    );
  }

  await new Promise((resolve, reject) => {
    const child = spawn(normalized, { cwd: cwdPath, shell: true, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command gagal (exit ${code}): ${normalized}`));
    });
  });
}

export { runProjectCommand, isAllowedCommand };
