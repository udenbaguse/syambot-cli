const SYAMBOT_SYSTEM_INSTRUCTION = [
  "You are Syambot, a terminal AI assistant.",
  "Always refer to yourself as Syambot.",
  "Do not claim to be ChatGPT.",
  "If asked about identity, answer that you are Syambot."
].join(" ");

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

function toChatMessages(messages, fallbackPrompt) {
  const base = [{ role: "system", content: SYAMBOT_SYSTEM_INSTRUCTION }];
  if (!Array.isArray(messages) || messages.length === 0) {
    return [...base, { role: "user", content: fallbackPrompt }];
  }

  const converted = messages.map((m) => ({
    role: String(m?.role || "user"),
    content: String(m?.content || "")
  }));
  return [...base, ...converted];
}

function extractErrorMessage(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  return "";
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function trailingPartialTagLength(text, tag) {
  const max = Math.min(text.length, tag.length - 1);
  for (let len = max; len > 0; len--) {
    if (tag.startsWith(text.slice(-len))) return len;
  }
  return 0;
}

function createThinkingParser() {
  return {
    inThink: false,
    buffer: ""
  };
}

function parseThinkContentChunk(state, chunkText, handlers = {}) {
  const openTag = "<think>";
  const closeTag = "</think>";
  const onThinkingChunk = typeof handlers.onThinkingChunk === "function" ? handlers.onThinkingChunk : () => {};
  const onAnswerChunk = typeof handlers.onAnswerChunk === "function" ? handlers.onAnswerChunk : () => {};
  const onThinkingStart = typeof handlers.onThinkingStart === "function" ? handlers.onThinkingStart : () => {};
  const onThinkingEnd = typeof handlers.onThinkingEnd === "function" ? handlers.onThinkingEnd : () => {};

  state.buffer += String(chunkText || "");

  while (state.buffer) {
    if (state.inThink) {
      const closeIdx = state.buffer.indexOf(closeTag);
      if (closeIdx === -1) {
        const keepLen = trailingPartialTagLength(state.buffer, closeTag);
        const emitPart = state.buffer.slice(0, state.buffer.length - keepLen);
        if (emitPart) onThinkingChunk(emitPart);
        state.buffer = state.buffer.slice(state.buffer.length - keepLen);
        return;
      }

      const thought = state.buffer.slice(0, closeIdx);
      if (thought) onThinkingChunk(thought);
      state.buffer = state.buffer.slice(closeIdx + closeTag.length);
      state.inThink = false;
      onThinkingEnd();
      continue;
    }

    const openIdx = state.buffer.indexOf(openTag);
    if (openIdx === -1) {
      const keepLen = trailingPartialTagLength(state.buffer, openTag);
      const emitPart = state.buffer.slice(0, state.buffer.length - keepLen);
      if (emitPart) onAnswerChunk(emitPart);
      state.buffer = state.buffer.slice(state.buffer.length - keepLen);
      return;
    }

    const answer = state.buffer.slice(0, openIdx);
    if (answer) onAnswerChunk(answer);
    state.buffer = state.buffer.slice(openIdx + openTag.length);
    state.inThink = true;
    onThinkingStart();
  }
}

function flushThinkContent(state, handlers = {}) {
  const onThinkingChunk = typeof handlers.onThinkingChunk === "function" ? handlers.onThinkingChunk : () => {};
  const onAnswerChunk = typeof handlers.onAnswerChunk === "function" ? handlers.onAnswerChunk : () => {};
  if (!state.buffer) return;
  if (state.inThink) onThinkingChunk(state.buffer);
  else onAnswerChunk(state.buffer);
  state.buffer = "";
}

function extractThinkingText(payload) {
  const direct = payload?.thinking;
  if (typeof direct === "string" && direct) return direct;
  const nested = payload?.message?.thinking;
  if (typeof nested === "string" && nested) return nested;
  return "";
}

async function readStreamWithTrace(response, hooks = {}) {
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let fullThinking = "";
  let thoughtStartedAt = 0;
  let thoughtEndedAt = 0;
  let sawThinking = false;
  const parserState = createThinkingParser();

  const onThinkingStart = typeof hooks.onThinkingStart === "function" ? hooks.onThinkingStart : () => {};
  const onThinkingChunk = typeof hooks.onThinkingChunk === "function" ? hooks.onThinkingChunk : () => {};
  const onThinkingEnd = typeof hooks.onThinkingEnd === "function" ? hooks.onThinkingEnd : () => {};
  const onAnswerStart = typeof hooks.onAnswerStart === "function" ? hooks.onAnswerStart : () => {};
  const onAnswerChunk = typeof hooks.onAnswerChunk === "function" ? hooks.onAnswerChunk : () => {};

  let answerStarted = false;

  function startThinkingIfNeeded() {
    if (sawThinking) return;
    sawThinking = true;
    thoughtStartedAt = Date.now();
    onThinkingStart();
  }

  function endThinkingIfNeeded() {
    if (!sawThinking || thoughtEndedAt) return;
    thoughtEndedAt = Date.now();
    const seconds = (thoughtEndedAt - thoughtStartedAt) / 1000;
    onThinkingEnd({ seconds });
  }

  function startAnswerIfNeeded() {
    if (answerStarted) return;
    answerStarted = true;
    onAnswerStart();
  }

  function handleThinkingChunk(chunk) {
    if (!chunk) return;
    startThinkingIfNeeded();
    fullThinking += chunk;
    onThinkingChunk(chunk);
  }

  function handleAnswerChunk(chunk) {
    if (!chunk) return;
    if (sawThinking) {
      endThinkingIfNeeded();
    }
    startAnswerIfNeeded();
    fullText += chunk;
    onAnswerChunk(chunk);
  }

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        const parsed = JSON.parse(line);
        const thinkingText = extractThinkingText(parsed);
        if (thinkingText) {
          handleThinkingChunk(thinkingText);
        }
        const text = String(parsed?.message?.content || "");
        if (text) {
          parseThinkContentChunk(parserState, text, {
            onThinkingStart: startThinkingIfNeeded,
            onThinkingEnd: endThinkingIfNeeded,
            onThinkingChunk: handleThinkingChunk,
            onAnswerChunk: handleAnswerChunk
          });
        }
      }
      index = buffer.indexOf("\n");
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const parsed = JSON.parse(tail);
    const thinkingText = extractThinkingText(parsed);
    if (thinkingText) {
      handleThinkingChunk(thinkingText);
    }
    const text = String(parsed?.message?.content || "");
    if (text) {
      parseThinkContentChunk(parserState, text, {
        onThinkingStart: startThinkingIfNeeded,
        onThinkingEnd: endThinkingIfNeeded,
        onThinkingChunk: handleThinkingChunk,
        onAnswerChunk: handleAnswerChunk
      });
    }
  }

  flushThinkContent(parserState, {
    onThinkingChunk: handleThinkingChunk,
    onAnswerChunk: handleAnswerChunk
  });

  if (sawThinking && !thoughtEndedAt) {
    endThinkingIfNeeded();
  }

  const thinkingSeconds = sawThinking
    ? ((thoughtEndedAt || Date.now()) - thoughtStartedAt) / 1000
    : 0;

  return {
    answer: fullText.trim(),
    thinking: fullThinking.trim(),
    thinkingSeconds
  };
}

function withBaseUrl(baseUrl) {
  return String(baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
}

function createOllamaClient(baseUrl) {
  const resolvedBaseUrl = withBaseUrl(baseUrl);

  async function ask({ prompt, messages, model, stream }) {
    const finalMessages = toChatMessages(messages, prompt);
    const url = `${resolvedBaseUrl}/api/chat`;

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: finalMessages,
          stream: Boolean(stream)
        })
      });
    } catch {
      throw new Error(
        `Gagal terhubung ke Ollama (${resolvedBaseUrl}). Pastikan Ollama aktif, contoh: ollama serve`
      );
    }

    if (!response.ok) {
      const payload = await safeJson(response);
      const detail = extractErrorMessage(payload);
      throw new Error(
        detail || `Request ke Ollama gagal dengan status ${response.status}`
      );
    }

    if (stream) {
      const streamed = await readStreamWithTrace(response, {
        onAnswerChunk: (chunk) => process.stdout.write(chunk)
      });
      process.stdout.write("\n");
      return streamed.answer;
    }

    const payload = await safeJson(response);
    const content = String(payload?.message?.content || "").trim();
    return content || "(Tidak ada konten teks dari model)";
  }

  async function askWithTrace({ prompt, messages, model, hooks }) {
    const finalMessages = toChatMessages(messages, prompt);
    const url = `${resolvedBaseUrl}/api/chat`;

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: finalMessages,
          stream: true
        })
      });
    } catch {
      throw new Error(
        `Gagal terhubung ke Ollama (${resolvedBaseUrl}). Pastikan Ollama aktif, contoh: ollama serve`
      );
    }

    if (!response.ok) {
      const payload = await safeJson(response);
      const detail = extractErrorMessage(payload);
      throw new Error(detail || `Request ke Ollama gagal dengan status ${response.status}`);
    }

    return readStreamWithTrace(response, hooks);
  }

  async function listModels() {
    const url = `${resolvedBaseUrl}/api/tags`;
    let response;
    try {
      response = await fetch(url);
    } catch {
      throw new Error(
        `Gagal terhubung ke Ollama (${resolvedBaseUrl}). Pastikan Ollama aktif, contoh: ollama serve`
      );
    }

    if (!response.ok) {
      throw new Error(`Gagal mengambil daftar model Ollama (status ${response.status})`);
    }

    const payload = await safeJson(response);
    const models = Array.isArray(payload?.models) ? payload.models : [];
    return models
      .map((m) => String(m?.model || m?.name || "").trim())
      .filter(Boolean);
  }

  return { ask, askWithTrace, listModels, baseUrl: resolvedBaseUrl };
}

export { createOllamaClient, DEFAULT_OLLAMA_BASE_URL };
