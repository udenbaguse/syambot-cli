import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readConfig, writeConfig, CONFIG_PATH } from "./config.js";
import { appendSessionMessage, loadSessionMessages, resolveSessionFile } from "./history.js";
import { createPuterClient } from "./providers/puter.js";

function printHelp() {
  console.log(`
syambot - terminal AI assistant

Usage:
  syambot ask "<prompt>" [--model <name>] [--stream] [--session <id>]
  syambot chat [--model <name>] [--session <id>]
  syambot login
  syambot config show
  syambot config set-model <model>
  syambot help

Environment:
  PUTER_AUTH_TOKEN   Optional token for Puter auth.
`);
}

function parseArgs(argv) {
  const flags = { stream: false };
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--stream") {
      flags.stream = true;
    } else if (arg === "--model") {
      flags.model = argv[i + 1];
      i++;
    } else if (arg === "--session") {
      flags.session = argv[i + 1];
      i++;
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

function resolveModel(flags, config) {
  return flags.model || config.model || "gpt-5-nano";
}

function isExitCommand(inputText) {
  const normalized = String(inputText || "").trim().toLowerCase();
  return normalized === "exit" || normalized === "/exit" || normalized === "quit" || normalized === "/quit";
}

async function maybePersistPuterToken(config, client) {
  if (!config.puterAuthToken && client.token) {
    await writeConfig({ ...config, puterAuthToken: client.token });
  }
}

async function appendSessionTurn(sessionId, model, prompt, answer) {
  if (!sessionId) return;
  const meta = { provider: "puter", model };
  await appendSessionMessage(sessionId, "user", prompt, meta);
  await appendSessionMessage(sessionId, "assistant", answer, meta);
}

async function runAsk(positionals, flags, config) {
  const prompt = positionals.slice(1).join(" ").trim();
  if (!prompt) {
    throw new Error("Prompt wajib diisi. Contoh: syambot ask \"buatkan ide konten\"");
  }

  const model = resolveModel(flags, config);
  const client = await createPuterClient(config.puterAuthToken);

  const history = flags.session ? await loadSessionMessages(flags.session) : [];
  const messages = [...history, { role: "user", content: prompt }];

  const answer = await client.ask({ prompt, messages, model, stream: flags.stream });
  if (!flags.stream) {
    console.log(answer);
  }

  await maybePersistPuterToken(config, client);
  await appendSessionTurn(flags.session, model, prompt, answer);
}

async function runChat(flags, config) {
  const model = resolveModel(flags, config);
  const rl = readline.createInterface({ input, output });

  if (flags.session) {
    console.log(`Session: ${flags.session} (${resolveSessionFile(flags.session)})`);
  }

  console.log(`Chat mode aktif (model: ${model}). Ketik exit / /exit / quit untuk keluar.`);
  const client = await createPuterClient(config.puterAuthToken);
  await maybePersistPuterToken(config, client);

  const messages = flags.session ? await loadSessionMessages(flags.session) : [];

  while (true) {
    const q = (await rl.question("you> ")).trim();
    if (!q) continue;
    if (isExitCommand(q)) break;

    const turnMessages = [...messages, { role: "user", content: q }];

    try {
      const answer = await client.ask({ prompt: q, messages: turnMessages, model, stream: false });
      console.log(`bot> ${answer}`);

      messages.push({ role: "user", content: q });
      messages.push({ role: "assistant", content: answer });
      await appendSessionTurn(flags.session, model, q, answer);
    } catch (err) {
      console.error(`error> ${err.message}`);
    }
  }

  rl.close();
}

async function runLogin(config) {
  const client = await createPuterClient(config.puterAuthToken);
  await writeConfig({ ...config, puterAuthToken: client.token });
  console.log("Login berhasil. Token Puter tersimpan di config lokal.");
}

async function runConfig(positionals, config) {
  const sub = positionals[1];

  if (sub === "show") {
    console.log(`Config path: ${CONFIG_PATH}`);
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  if (sub === "set-model") {
    const model = positionals[2];
    if (!model) throw new Error("Model wajib diisi. Contoh: syambot config set-model gpt-5-nano");
    const next = { ...config, model };
    await writeConfig(next);
    console.log(`Default model diset ke: ${model}`);
    return;
  }

  throw new Error("Perintah config tidak dikenali. Gunakan: show | set-model");
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const cmd = positionals[0] || "help";
  const config = await readConfig();

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  if (cmd === "ask") {
    await runAsk(positionals, flags, config);
    return;
  }

  if (cmd === "chat") {
    await runChat(flags, config);
    return;
  }

  if (cmd === "login") {
    await runLogin(config);
    return;
  }

  if (cmd === "config") {
    await runConfig(positionals, config);
    return;
  }

  throw new Error(`Command tidak dikenal: ${cmd}. Jalankan 'syambot help'.`);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exitCode = 1;
});