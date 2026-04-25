# Syambot CLI

A terminal-based AI assistant you can run directly from the command line.

This CLI uses:
- `commander` for cleaner command/flag parsing
- `chalk` for colored terminal output
- `boxen` for a nicer hero/help box layout

## Install

```bash
npm i -g @syamaitech/syambot-cli
```
```bash
syambot help
```

## Usage

```bash
syambot help
syambot ask "Give me TikTok content ideas about AI"
syambot chat
syambot config show
syambot config list-models
syambot config set-model gemma4:e2b
# aliases:
syambot a "hello"
syambot c
syambot cfg show
```

Available models:

- depends on models you already downloaded in local Ollama
- example: `gemma4:e2b`

## AI Coding Mode (Read Project + Apply)

```bash
syambot ask "build CRUD products with express + postgres" --project
syambot ask "build CRUD products with express + postgres" --project --apply
```

Explanation:
- `--project`: Syambot reads your current project structure and file snippets.
- `--apply`: Syambot tries to apply file changes from AI output (`syambot-file` blocks).

Notes:
- `--apply` cannot be used together with `--stream`.
- File changes are restricted to the current project root.

## Chat Agent Mode (Auto Read Dir + Execute Action)

When you run `syambot chat`, Syambot will:

- automatically read the current project directory
- use that context when answering
- estimate the most relevant target files from project structure + user prompt
- show model thinking in real time (if the model sends thinking trace)
- show a `Thinking time: n seconds` summary after completion
- execute valid action blocks from model output
- auto-fallback and retry action-format conversion if model forgets action block format

Extra commands in chat:

- `/think` to reopen the latest thinking log (accordion-style in terminal)
- `--strict-agent` to show assistant answer only when file changes are actually applied

Example:

```bash
syambot chat --strict-agent
```

Example prompts in chat:

- `create a responsive navbar in this project`
- `create src/modules/user folder and basic express route file`
- `install express and cors`

Allowed terminal commands from AI output:

- `npm install|i|uninstall|remove|run`
- `pnpm install|add|remove|run`
- `yarn install|add|remove|run`
- `bun install|add|remove|run`
- `npx ...`
- `node ...`
- `git ...`
- `mkdir ...` / `md ...`

## File & Folder CRUD

```bash
syambot fs create-folder notes
syambot fs create-file notes/todo.txt "Learn CRUD"
syambot fs read-file notes/todo.txt
syambot fs update-file notes/todo.txt "Learn CRUD + AI"
syambot fs list-folder notes
syambot fs rename notes/todo.txt notes/task.txt
syambot fs delete-file notes/task.txt
syambot fs delete-folder notes --recursive
```

Notes:
- `fs` operations are restricted to the current project directory.
- Folder deletion requires `--recursive` for safety.

## Session history

```bash
syambot ask "draft a caption" --session content
syambot chat --session content
```

History is stored at:

- `~/.syambot/sessions/<id>.jsonl`

## Environment

- `OLLAMA_BASE_URL` (optional, default `http://127.0.0.1:11434`)

## Development

```bash
npm install
npm run check
npm run bot -- help
```

## Join as a Collaborator

See the full guide at:

- [CONTRIBUTING.en.md](./CONTRIBUTING.en.md)
