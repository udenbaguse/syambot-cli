import { stdout } from "node:process";

const FRAMES = ["|", "/", "-", "\\"];

function createSpinner(text = "Loading") {
  let timer = null;
  let idx = 0;
  const enabled = Boolean(stdout.isTTY);

  function render() {
    if (!enabled) return;
    const frame = FRAMES[idx % FRAMES.length];
    idx += 1;
    stdout.write(`\r${frame} ${text}...`);
  }

  return {
    start() {
      if (!enabled || timer) return;
      render();
      timer = setInterval(render, 100);
    },
    stop(successText) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (!enabled) return;
      const finalText = successText ? `\r${successText}\n` : "\r\n";
      stdout.write(finalText);
    }
  };
}

async function withSpinner(text, task) {
  const spinner = createSpinner(text);
  spinner.start();
  try {
    const result = await task();
    spinner.stop();
    return result;
  } catch (err) {
    spinner.stop();
    throw err;
  }
}

export { createSpinner, withSpinner };
