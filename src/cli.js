import readline from "node:readline/promises";
import { cwd, stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { readConfig, writeConfig, CONFIG_PATH } from "./config.js";
import { appendSessionMessage, loadSessionMessages, resolveSessionFile } from "./history.js";
import { createOllamaClient } from "./providers/ollama.js";
import { runFsCommand } from "./fs-crud.js";
import { buildProjectContext, buildProjectTree } from "./project-context.js";
import { applyAiActions, buildApplyInstruction } from "./ai-apply.js";
import { withSpinner } from "./spinner.js";

const DEFAULT_MODEL = "gemma4:e2b";

const UI = {
  brand: chalk.bold.hex("#0ea5e9"),
  accent: chalk.bold.hex("#f59e0b"),
  dim: chalk.gray,
  info: chalk.cyan,
  success: chalk.greenBright,
  warn: chalk.yellowBright,
  error: chalk.redBright
};

function label(type, text) {
  if (type === "ok") return `${UI.success("[OK]")} ${text}`;
  if (type === "warn") return `${UI.warn("[WARN]")} ${text}`;
  if (type === "err") return `${UI.error("[ERR]")} ${text}`;
  return `${UI.info("[INFO]")} ${text}`;
}

function renderHero() {
  const content = [
    `${UI.brand("SYAMBOT CLI")}  ${UI.dim("vibe terminal coding partner")}`,
    UI.dim("Powered by Ollama local model"),
    "",
    `${UI.accent("Quick Start")}`,
    `${UI.dim("$")} syambot chat`,
    `${UI.dim("$")} syambot ask "buatkan ide konten tech"`,
    `${UI.dim("$")} syambot config list-models`
  ].join("\n");

  return boxen(content, {
    borderStyle: "round",
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
    borderColor: "cyan"
  });
}

function printBanner() {
  console.log(renderHero());
}

function resolveModel(flags, config) {
  return flags.model || config.model || DEFAULT_MODEL;
}

function isExitCommand(inputText) {
  const normalized = String(inputText || "").trim().toLowerCase();
  return normalized === "exit" || normalized === "/exit" || normalized === "quit" || normalized === "/quit";
}

function isThinkCommand(inputText) {
  const normalized = String(inputText || "").trim().toLowerCase();
  return normalized === "/think" || normalized === "think";
}

function renderThinkingAccordion(thinkingText, thinkingSeconds) {
  const body = thinkingText?.trim() || "(kosong)";
  const title = `Waktu berpikir: ${thinkingSeconds.toFixed(2)} detik`;
  return boxen(`${UI.accent(title)}\n\n${UI.dim(body)}`, {
    borderStyle: "round",
    borderColor: "yellow",
    padding: { top: 0, right: 1, bottom: 0, left: 1 }
  });
}

function shouldTryAutoApply(userPrompt, answerText) {
  const prompt = String(userPrompt || "").toLowerCase();
  const answer = String(answerText || "");
  const hasActionBlock = /```syambot-(file|delete|cmd)/i.test(answer);
  if (hasActionBlock) return false;

  const likelyCodeTask = /(buat|bikin|ubah|edit|refactor|tambah|hapus|create|update|delete|navbar|component|halaman|layout|css|html|javascript|typescript|react|vue|svelte|file|folder)/i;
  return likelyCodeTask.test(prompt);
}

function buildAutoApplyRecoveryPrompt(userPrompt, assistantAnswer, projectTree) {
  return [
    "Tugasmu mengubah jawaban assistant menjadi aksi file yang bisa dieksekusi otomatis oleh Syambot.",
    "Kamu HARUS output HANYA blok aksi valid. Jangan beri penjelasan tambahan.",
    "",
    "Aturan:",
    "- Gunakan format syambot-file/syambot-delete/syambot-cmd saja.",
    "- Untuk perubahan file, isi blok harus full content file final.",
    "- Gunakan path relatif dari root project.",
    "- Jika tidak perlu command terminal, jangan output syambot-cmd.",
    "",
    "Instruksi format:",
    buildApplyInstruction(),
    "",
    "Permintaan user:",
    userPrompt,
    "",
    "Jawaban assistant sebelumnya:",
    assistantAnswer,
    "",
    "Konteks struktur project:",
    projectTree
  ].join("\n");
}

async function applyActionsWithFallback({
  answerText,
  userPrompt,
  client,
  model,
  projectTree,
  cwdPath
}) {
  const firstPass = await applyAiActions(answerText, { executeCommands: true, cwdPath });
  if (firstPass.applied.length > 0) {
    return { ...firstPass, recovered: false };
  }

  if (!shouldTryAutoApply(userPrompt, answerText)) {
    return { ...firstPass, recovered: false };
  }

  const recoveryPrompt = buildAutoApplyRecoveryPrompt(userPrompt, answerText, projectTree);
  const recoveryAnswer = await withSpinner("Mencoba auto-apply fallback", () =>
    client.ask({
      prompt: recoveryPrompt,
      messages: [{ role: "user", content: recoveryPrompt }],
      model,
      stream: false
    }));

  const secondPass = await applyAiActions(recoveryAnswer, { executeCommands: true, cwdPath });
  return {
    ...secondPass,
    recovered: secondPass.applied.length > 0
  };
}

async function appendSessionTurn(sessionId, model, prompt, answer) {
  if (!sessionId) return;
  const meta = { provider: "ollama", model };
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
  const targetHints = suggestTargetFiles(userPrompt, projectTree);
  return [
    userPrompt,
    "",
    "Konteks direktori project saat ini:",
    projectTree,
    "",
    "Prioritas target file (estimasi):",
    ...targetHints.map((item) => `- ${item}`),
    "",
    "Jika user meminta perubahan project, balas ringkas + sertakan blok aksi yang bisa dieksekusi.",
    buildApplyInstruction()
  ].join("\n");
}

function suggestTargetFiles(userPrompt, projectTree) {
  const lines = String(projectTree || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
  const files = lines.map((line) => line.slice(2).trim()).filter(Boolean);
  if (files.length === 0) return ["(tidak ada hint file)"];

  const query = String(userPrompt || "").toLowerCase();
  const keywords = new Set(
    query
      .split(/[^a-z0-9]+/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)
  );

  function scorePath(relPath) {
    const p = relPath.toLowerCase();
    let score = 0;
    for (const key of keywords) {
      if (p.includes(key)) score += 3;
    }
    if (query.includes("navbar") && /(nav|navbar|header|layout)/.test(p)) score += 8;
    if (query.includes("responsive") && /(css|scss|sass|tailwind|style|styles|component|layout)/.test(p)) score += 5;
    if (/(react|jsx|tsx)/.test(query) && /\.(jsx|tsx)$/.test(p)) score += 4;
    if (/(vue)/.test(query) && /\.vue$/.test(p)) score += 4;
    if (/(html)/.test(query) && /\.html$/.test(p)) score += 4;
    if (/(css|style|tailwind)/.test(query) && /\.(css|scss|sass|less|tsx|jsx|vue|html)$/.test(p)) score += 2;
    if (/^src\//.test(p)) score += 1;
    return score;
  }

  const ranked = files
    .map((f) => ({ file: f, score: scorePath(f) }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, 5)
    .map((x) => x.file);

  return ranked.length > 0 ? ranked : ["(tidak ada hint file)"];
}

async function runAsk(promptParts, flags, config) {
  const userPrompt = promptParts.join(" ").trim();
  if (!userPrompt) {
    throw new Error('Prompt wajib diisi. Contoh: syambot ask "buatkan ide konten"');
  }

  if (flags.apply && flags.stream) {
    throw new Error("--apply tidak bisa dipakai bersamaan dengan --stream.");
  }

  const model = resolveModel(flags, config);
  const client = createOllamaClient(config.ollamaBaseUrl);
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
    const result = await applyActionsWithFallback({
      answerText: answer,
      userPrompt,
      client,
      model,
      projectTree: await buildProjectTree(cwd(), { maxFiles: 160 }),
      cwdPath: cwd()
    });
    if (result.applied.length === 0) {
      console.log(`\n${label("warn", "Tidak ada blok aksi yang bisa diterapkan.")}`);
    } else {
      if (result.recovered) {
        console.log(`\n${label("info", "Auto-apply fallback aktif: format jawaban diperbaiki otomatis.")}`);
      }
      console.log(`\n${label("ok", "Perubahan diterapkan:")}`);
      for (const item of result.applied) {
        console.log(`- ${item}`);
      }
    }
  }

  await appendSessionTurn(flags.session, model, userPrompt, answer);
}

async function runChat(flags, config) {
  const model = resolveModel(flags, config);
  const strictAgent = Boolean(flags.strictAgent);
  const rl = readline.createInterface({ input, output });
  let lastThinkingText = "";
  let lastThinkingSeconds = 0;

  if (flags.session) {
    console.log(label("info", `Session ${flags.session} (${resolveSessionFile(flags.session)})`));
  }

  console.log(label("info", `Chat mode aktif (model: ${model}). Ketik exit / /exit / quit untuk keluar.`));
  console.log(label("info", "Tips: ketik /think untuk membuka log berpikir terakhir."));
  if (strictAgent) {
    console.log(label("info", "Mode strict-agent aktif: jawaban hanya ditampilkan jika ada perubahan file yang berhasil diterapkan."));
  }
  const client = createOllamaClient(config.ollamaBaseUrl);

  const messages = flags.session ? await loadSessionMessages(flags.session) : [];
  let projectTree = await withSpinner("Membaca direktori project", () =>
    buildProjectTree(cwd(), { maxFiles: 160 }));

  while (true) {
    const q = (await rl.question(chalk.blueBright("you> "))).trim();
    if (!q) continue;
    if (isExitCommand(q)) break;
    if (isThinkCommand(q)) {
      if (!lastThinkingText) {
        console.log(label("warn", "Belum ada thinking log untuk ditampilkan."));
      } else {
        console.log(renderThinkingAccordion(lastThinkingText, lastThinkingSeconds));
      }
      continue;
    }

    const promptWithContext = buildChatAgentPrompt(q, projectTree);
    const turnMessages = [...messages, { role: "user", content: promptWithContext }];

    try {
      let answer = "";
      let thinking = "";
      let thinkingSeconds = 0;

      if (strictAgent) {
        const strictResult = await withSpinner("Syambot sedang berpikir", () =>
          client.askWithTrace({ prompt: promptWithContext, messages: turnMessages, model }));
        answer = strictResult.answer || "(Tidak ada konten teks dari model)";
        thinking = strictResult.thinking || "";
        thinkingSeconds = Number(strictResult.thinkingSeconds || 0);
      } else {
        let thinkingLiveStarted = false;
        let thinkingLiveEnded = false;
        let answerStarted = false;

        const result = await client.askWithTrace({
          prompt: promptWithContext,
          messages: turnMessages,
          model,
          hooks: {
            onThinkingStart: () => {
              if (!thinkingLiveStarted) {
                thinkingLiveStarted = true;
                process.stdout.write(UI.dim("thinking> "));
              }
            },
            onThinkingChunk: (chunk) => {
              if (!thinkingLiveStarted) {
                thinkingLiveStarted = true;
                process.stdout.write(UI.dim("thinking> "));
              }
              process.stdout.write(UI.dim(chunk));
            },
            onThinkingEnd: ({ seconds }) => {
              if (thinkingLiveStarted && !thinkingLiveEnded) {
                thinkingLiveEnded = true;
                process.stdout.write("\n");
                console.log(label("info", `v Waktu berpikir ${Number(seconds || 0).toFixed(2)} detik (ketik /think untuk buka lagi)`));
              }
            },
            onAnswerStart: () => {
              if (thinkingLiveStarted && !thinkingLiveEnded) {
                thinkingLiveEnded = true;
                process.stdout.write("\n");
              }
              if (!answerStarted) {
                answerStarted = true;
                process.stdout.write(`${UI.success("bot>")} `);
              }
            },
            onAnswerChunk: (chunk) => {
              if (!answerStarted) {
                answerStarted = true;
                process.stdout.write(`${UI.success("bot>")} `);
              }
              process.stdout.write(chunk);
            }
          }
        });

        answer = result.answer || "(Tidak ada konten teks dari model)";
        thinking = result.thinking || "";
        thinkingSeconds = Number(result.thinkingSeconds || 0);

        if (answerStarted) {
          process.stdout.write("\n");
        } else {
          console.log(`${UI.success("bot>")} ${answer}`);
        }

        if (thinking && !thinkingLiveEnded) {
          console.log(label("info", `v Waktu berpikir ${thinkingSeconds.toFixed(2)} detik (ketik /think untuk buka lagi)`));
        }
      }

      lastThinkingText = thinking;
      lastThinkingSeconds = thinkingSeconds;

      const applied = await applyActionsWithFallback({
        answerText: answer,
        userPrompt: q,
        client,
        model,
        projectTree,
        cwdPath: cwd()
      });
      if (applied.applied.length > 0) {
        if (strictAgent) {
          console.log(`${UI.success("bot>")} ${answer}`);
        }
        if (applied.recovered) {
          console.log(label("info", "Auto-apply fallback aktif: format jawaban diperbaiki otomatis."));
        }
        console.log(label("ok", "Aksi dijalankan:"));
        for (const item of applied.applied) {
          console.log(`- ${item}`);
        }
        projectTree = await withSpinner("Refresh direktori project", () =>
          buildProjectTree(cwd(), { maxFiles: 160 }));
      } else if (strictAgent) {
        console.log(label("warn", "Mode strict-agent: tidak ada perubahan file yang berhasil diterapkan, jawaban disembunyikan."));
      }

      messages.push({ role: "user", content: q });
      messages.push({ role: "assistant", content: answer });
      await appendSessionTurn(flags.session, model, q, answer);
    } catch (err) {
      console.error(`${UI.error("error>")} ${err.message || String(err)}`);
    }
  }

  rl.close();
}

async function runConfigShow(config) {
  console.log(label("info", `Config path: ${CONFIG_PATH}`));
  console.log(JSON.stringify(config, null, 2));
}

async function runConfigSetModel(model, config) {
  if (!model) throw new Error("Model wajib diisi. Contoh: syambot config set-model gemma4:e2b");
  const next = { ...config, model };
  await writeConfig(next);
  console.log(label("ok", `Default model diset ke: ${model}`));
}

async function runConfigListModels(config) {
  const client = createOllamaClient(config.ollamaBaseUrl);
  const models = await withSpinner("Mengambil daftar model Ollama lokal", () => client.listModels());
  if (models.length === 0) {
    console.log(label("warn", "Belum ada model di Ollama lokal."));
    console.log("Download dulu, contoh: ollama pull gemma4:e2b");
    return;
  }
  console.log(label("info", "Model Ollama yang tersedia:"));
  for (const item of models) {
    console.log(`- ${item}`);
  }
}

async function main() {
  const config = await readConfig();
  const program = new Command();

  program
    .name("syambot")
    .description("Terminal AI assistant")
    .showHelpAfterError()
    .showSuggestionAfterError()
    .addHelpText("beforeAll", `${renderHero()}\n`)
    .addHelpText(
      "afterAll",
      [
        "",
        UI.accent("Command Groups"),
        "- Core AI: ask, chat",
        "- Config: config show, config set-model, config list-models",
        "- File helper: fs <action> [args...]",
        "",
        UI.accent("Examples"),
        "- syambot ask \"ringkas changelog ini\" --session docs",
        "- syambot ask \"refactor auth module\" --project --apply",
        "- syambot chat --model gemma4:e2b",
        "",
        UI.dim("Env: OLLAMA_BASE_URL (default http://127.0.0.1:11434)")
      ].join("\n")
    );

  program
    .command("ask")
    .alias("a")
    .description("Kirim 1 prompt ke model")
    .argument("<prompt...>", "Prompt yang ingin dikirim")
    .option("--model <name>", "Nama model Ollama")
    .option("--stream", "Tampilkan output streaming")
    .option("--session <id>", "Simpan/lanjutkan session")
    .option("--project", "Sertakan konteks project saat ini")
    .option("--apply", "Terapkan blok aksi dari output AI")
    .action(async (prompt, options) => {
      await runAsk(prompt, options, config);
    });

  program
    .command("chat")
    .alias("c")
    .description("Masuk mode chat interaktif")
    .option("--model <name>", "Nama model Ollama")
    .option("--session <id>", "Simpan/lanjutkan session")
    .option("--strict-agent", "Hanya tampilkan jawaban jika perubahan file berhasil diterapkan")
    .action(async (options) => {
      await runChat(options, config);
    });

  const configCommand = program.command("config").alias("cfg").description("Kelola konfigurasi Syambot");

  configCommand
    .command("show")
    .description("Tampilkan konfigurasi saat ini")
    .action(async () => {
      await runConfigShow(config);
    });

  configCommand
    .command("set-model")
    .description("Set default model")
    .argument("<model>", "Nama model (contoh: gemma4:e2b)")
    .action(async (model) => {
      await runConfigSetModel(model, config);
    });

  configCommand
    .command("list-models")
    .description("List model yang tersedia di Ollama lokal")
    .action(async () => {
      await runConfigListModels(config);
    });

  program
    .command("fs")
    .alias("file")
    .description("File/folder CRUD helper")
    .argument("<action>", "Aksi fs")
    .argument("[args...]", "Argumen tambahan")
    .option("-r, --recursive", "Hapus folder secara recursive")
    .action(async (action, args, options) => {
      const positionals = ["fs", action, ...args];
      const flags = { recursive: Boolean(options.recursive) };
      await runFsCommand(positionals, flags);
    });

  program
    .command("help")
    .description("Tampilkan bantuan")
    .action(() => {
      printBanner();
      program.outputHelp();
    });

  program.action(() => {
    printBanner();
    program.outputHelp();
  });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(`${UI.error("Fatal:")} ${err.message || String(err)}`);
  process.exitCode = 1;
});
