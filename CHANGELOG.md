# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
