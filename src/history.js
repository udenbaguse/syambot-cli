import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, appendFile, readFile } from "node:fs/promises";

const SESSIONS_DIR = join(homedir(), ".syambot", "sessions");

function resolveSessionFile(sessionId) {
  const safe = String(sessionId || "default").replace(/[^a-zA-Z0-9_-]/g, "-");
  return join(SESSIONS_DIR, `${safe}.jsonl`);
}

async function loadSessionMessages(sessionId) {
  const filePath = resolveSessionFile(sessionId);
  try {
    const raw = await readFile(filePath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const messages = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (!entry || !entry.role || typeof entry.content !== "string") continue;
        messages.push({ role: entry.role, content: entry.content });
      } catch {
        // Ignore malformed history line.
      }
    }

    return messages;
  } catch {
    return [];
  }
}

async function appendSessionMessage(sessionId, role, content, meta = {}) {
  const filePath = resolveSessionFile(sessionId);
  await mkdir(SESSIONS_DIR, { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    role,
    content,
    ...meta
  };
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

export { SESSIONS_DIR, resolveSessionFile, loadSessionMessages, appendSessionMessage };