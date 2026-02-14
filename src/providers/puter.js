import { init, getAuthToken } from "@heyputer/puter.js/src/init.cjs";

const SYAMBOT_SYSTEM_INSTRUCTION = [
  "SYSTEM:",
  "You are Syambot, a terminal AI assistant.",
  "Always refer to yourself as Syambot.",
  "Do not claim to be ChatGPT.",
  "If asked about identity, answer that you are Syambot."
].join(" ");

function messagesToPrompt(messages, fallbackPrompt) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return `${SYAMBOT_SYSTEM_INSTRUCTION}\n\nUSER: ${fallbackPrompt}\n\nASSISTANT:`;
  }

  const transcript = messages
    .map((m) => `${String(m.role || "user").toUpperCase()}: ${m.content}`)
    .join("\n\n");

  return `${SYAMBOT_SYSTEM_INSTRUCTION}\n\n${transcript}\n\nASSISTANT:`;
}

function extractText(payload) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";

  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.content === "string") return payload.content;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.message?.content === "string") return payload.message.content;

  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (typeof choice?.delta?.content === "string") return choice.delta.content;
  if (typeof choice?.text === "string") return choice.text;

  return "";
}

async function createPuterClient(savedToken) {
  const token = process.env.PUTER_AUTH_TOKEN || savedToken || await getAuthToken();
  const puter = init(token);

  async function ask({ prompt, messages, model, stream }) {
    const finalPrompt = messagesToPrompt(messages, prompt);

    if (stream) {
      const response = await puter.ai.chat(finalPrompt, { model, stream: true });
      let fullText = "";
      for await (const part of response) {
        const chunk = extractText(part);
        if (!chunk) continue;
        fullText += chunk;
        process.stdout.write(chunk);
      }
      process.stdout.write("\n");
      return fullText.trim();
    }

    const response = await puter.ai.chat(finalPrompt, { model });
    const content = extractText(response).trim();
    return content || "(Tidak ada konten teks dari model)";
  }

  return { ask, token };
}

export { createPuterClient };