import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = join(homedir(), ".syambot", "config.json");
const DEFAULT_CONFIG = {
  model: "gpt-5-nano"
};

function sanitizeConfig(parsed) {
  return {
    model: typeof parsed?.model === "string" && parsed.model.trim() ? parsed.model : DEFAULT_CONFIG.model,
    puterAuthToken: typeof parsed?.puterAuthToken === "string" ? parsed.puterAuthToken : undefined
  };
}

async function readConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return sanitizeConfig(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function writeConfig(nextConfig) {
  const clean = sanitizeConfig(nextConfig);
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(clean, null, 2), "utf8");
}

export { CONFIG_PATH, DEFAULT_CONFIG, readConfig, writeConfig };