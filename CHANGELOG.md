# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-04-20

### Added

- Ollama local provider integration (default base URL `http://127.0.0.1:11434`).
- Default model switched to `gemma4:e2b`.
- New Ollama model discovery via `syambot config list-models`.
- CLI UX upgrades:
  - `commander` command parser + aliases (`a`, `c`, `cfg`, `file`)
  - colored output via `chalk`
  - boxed hero/help UI via `boxen`
- Chat thinking trace support:
  - real-time thinking stream (when model provides it)
  - thinking duration summary
  - `/think` command to reopen last thinking log
- Auto-apply fallback for agentic edits:
  - when model returns plain text (without action blocks), Syambot retries with a strict action-format conversion pass.
- Target-file suggestion in chat prompts to improve file selection for coding tasks.
- New `chat` option: `--strict-agent` (only shows final assistant answer when file changes are actually applied).

### Changed

- Removed Puter-based auth/login flow and migrated runtime to local Ollama.
- Help/usage and README examples updated for Ollama-first workflow.
- `ask --apply` and `chat` now use fallback-based action application flow for better reliability.

### Security

- File writes/deletes remain constrained to project root.
- Command execution remains limited to safe allowlisted prefixes and blocked shell operators.

## [1.1.0] - 2026-02-14

### Added

- File and folder CRUD commands via `syambot fs`:
  - `create-file`, `read-file`, `update-file`, `delete-file`
  - `create-folder`, `list-folder`, `delete-folder --recursive`, `rename`
- AI coding mode on `ask`:
  - `--project` to inject current project context automatically
  - `--apply` to apply AI-generated file/action blocks directly
- Chat agent behavior:
  - auto-read current project directory tree during `syambot chat`
  - auto-apply AI action blocks for files/folders/allowed commands
- Loading spinner feedback while waiting for AI/network operations.
- Additional model support:
  - `gpt-5.1-codex`
  - `gpt-5.1-codex-max`
- New command: `syambot config list-models`.

### Changed

- Response extraction normalized so output prefers plain text content (not raw object payloads).
- Chat exit command supports `exit`, `/exit`, `quit`, and `/quit`.
- Identity instruction strengthened so assistant identifies as `Syambot`.
- Command whitelist expanded for agent actions to include:
  - `node`, `git`, `mkdir`, `md`

### Security

- Agent command execution remains restricted:
  - blocks unsafe operators/tokens such as `&&`, `;`, `|`, `>`, `<`
  - blocks dangerous destructive patterns by default
  - keeps file operations constrained to the current project root

## [1.0.0] - 2026-02-14

### Added

- Initial release of `syambot-cli`.
- Terminal commands: `ask`, `chat`, `login`, and `config`.
- Puter-based AI integration for terminal chat.
- Session history persistence with `--session`.
- npm bin command: `syambot`.
