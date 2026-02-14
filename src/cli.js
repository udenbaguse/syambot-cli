import readline from "node:readline/promises";
import { cwd, stdin as input, stdout as output } from "node:process";
import { readConfig, writeConfig, CONFIG_PATH } from "./config.js";
import { appendSessionMessage, loadSessionMessages, resolveSessionFile } from "./history.js";
import { createPuterClient } from "./providers/puter.js";
import { runFsCommand } from "./fs-crud.js";
import { buildProjectContext, buildProjectTree } from "./project-context.js";
import { applyAiActions, buildApplyInstruction } from "./ai-apply.js";
import { withSpinner } from "./spinner.js";

function printHelp() {
  console.log(`
syambot - terminal AI assistant

Usage:
  syambot ask "<prompt>" [--model <name>] [--stream] [--session <id>] [--project] [--apply]
  syambot chat [--model <name>] [--session <id>]
  syambot login
  syambot config show
  syambot config set-model <model>
  syambot fs <command> [...args]
  syambot help

AI Coding Mode:
  --project   Sertakan konteks project saat ini (tree + snippet file)
  --apply     Terapkan perubahan file/command dari blok output AI

File/Folder CRUD:
  syambot fs create-file <path> <content>
  syambot fs read-file <path>
  syambot fs update-file <path> <content>
  syambot fs delete-file <path>
  syambot fs create-folder <path>
  syambot fs list-folder [path]
  syambot fs delete-folder <path> --recursive
  syambot fs rename <from> <to>

Environment:
  PUTER_AUTH_TOKEN   Optional token for Puter auth.
`);
}

function parseArgs(argv) {
  const flags = { stream: false, recursive: false, project: false, apply: false };
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--stream") {
      flags.stream = true;
    } else if (arg === "--recursive" || arg === "-r") {
      flags.recursive = true;
    } else if (arg === "--project") {
      flags.project = true;
    } else if (arg === "--apply") {
      flags.apply = true;
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

async function buildAskPrompt(userPrompt, flags) {
  if (!flags.project && !flags.apply) return userPrompt;

  const chunks = [userPrompt];

  if (flags.project) {
    const context = await withSpinner("Membaca project", () => buildProjectContext(cwd()));
    chunks.push("Gunakan konteks project berikut untuk membuat jawaban/coding yang relevan:");
    chunks.push(context);
  }

  if (flags.apply) {
    chunks.push(buildApplyInstruction());
  }

  return chunks.join("\n\n");
}

function buildChatAgentPrompt(userPrompt, projectTree) {
  return [
    userPrompt,
    "",
    "Konteks direktori project saat ini:",
    projectTree,
    "",
    "Jika user meminta perubahan project, balas ringkas + sertakan blok aksi yang bisa dieksekusi.",
    buildApplyInstruction()
  ].join("\n");
}

async function runAsk(positionals, flags, config) {
  const userPrompt = positionals.slice(1).join(" ").trim();
  if (!userPrompt) {
    throw new Error("Prompt wajib diisi. Contoh: syambot ask \"buatkan ide konten\"");
  }

  if (flags.apply && flags.stream) {
    throw new Error("--apply tidak bisa dipakai bersamaan dengan --stream.");
  }

  const model = resolveModel(flags, config);
  const client = await createPuterClient(config.puterAuthToken);
  const finalPrompt = await buildAskPrompt(userPrompt, flags);

  const history = flags.session ? await loadSessionMessages(flags.session) : [];
  const messages = [...history, { role: "user", content: finalPrompt }];

  const answer = flags.stream
    ? await client.ask({ prompt: finalPrompt, messages, model, stream: true })
    : await withSpinner("Syambot sedang berpikir", () =>
      client.ask({ prompt: finalPrompt, messages, model, stream: false }));
  if (!flags.stream) {
    console.log(answer);
  }

  if (flags.apply) {
    const result = await applyAiActions(answer, { executeCommands: true, cwdPath: cwd() });
    if (result.applied.length === 0) {
      console.log("\n[APPLY] Tidak ada blok aksi yang bisa diterapkan.");
    } else {
      console.log("\n[APPLY] Perubahan diterapkan:");
      for (const item of result.applied) {
        console.log(`- ${item}`);
      }
    }
  }

  await maybePersistPuterToken(config, client);
  await appendSessionTurn(flags.session, model, userPrompt, answer);
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
  let projectTree = await withSpinner("Membaca direktori project", () =>
    buildProjectTree(cwd(), { maxFiles: 160 }));

  while (true) {
    const q = (await rl.question("you> ")).trim();
    if (!q) continue;
    if (isExitCommand(q)) break;

    const promptWithContext = buildChatAgentPrompt(q, projectTree);
    const turnMessages = [...messages, { role: "user", content: promptWithContext }];

    try {
      const answer = await withSpinner("Syambot sedang berpikir", () =>
        client.ask({ prompt: promptWithContext, messages: turnMessages, model, stream: false }));
      console.log(`bot> ${answer}`);

      const applied = await applyAiActions(answer, { executeCommands: true, cwdPath: cwd() });
      if (applied.applied.length > 0) {
        console.log("[APPLY] Aksi dijalankan:");
        for (const item of applied.applied) {
          console.log(`- ${item}`);
        }
        projectTree = await withSpinner("Refresh direktori project", () =>
          buildProjectTree(cwd(), { maxFiles: 160 }));
      }

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
  const client = await withSpinner("Login ke Puter", () => createPuterClient(config.puterAuthToken));
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

  if (cmd === "fs") {
    await runFsCommand(positionals, flags);
    return;
  }

  throw new Error(`Command tidak dikenal: ${cmd}. Jalankan 'syambot help'.`);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exitCode = 1;
});
