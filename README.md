# Syambot CLI

AI assistant berbasis terminal yang bisa dijalankan langsung dari command line.

## Install

```bash
npm i -g github:udenbaguse/syambot-cli
```
```bash
syambot help
```

## Usage

```bash
syambot help
syambot login
syambot ask "Buatkan ide konten TikTok tentang AI"
syambot chat
syambot config show
syambot config list-models
syambot config set-model gpt-5.1-codex
```

Model yang tersedia:

- `gpt-5-nano`
- `gpt-5.1-codex`
- `gpt-5.1-codex-max`

## AI Coding Mode (Read Project + Apply)

```bash
syambot ask "buatkan CRUD produk express + postgres" --project
syambot ask "buatkan CRUD produk express + postgres" --project --apply
```

Penjelasan:
- `--project`: Syambot membaca struktur dan snippet file project saat ini.
- `--apply`: Syambot mencoba menerapkan perubahan file dari output AI (blok `syambot-file`).

Catatan:
- `--apply` tidak bisa dipakai bersama `--stream`.
- Perubahan file hanya boleh di dalam root project yang sedang kamu buka.

## Chat Agent Mode (Auto Read Dir + Execute Action)

Saat menjalankan `syambot chat`, Syambot akan:

- otomatis membaca direktori project saat ini
- menggunakan konteks tersebut untuk menjawab
- mengeksekusi aksi dari output AI jika ada blok aksi valid

Contoh prompt di chat:

- `buatkan navbar responsive di project ini`
- `buat folder src/modules/user dan file route express dasar`
- `install express dan cors`

Command terminal yang diizinkan dari output AI saat ini:

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
syambot fs create-file notes/todo.txt "Belajar CRUD"
syambot fs read-file notes/todo.txt
syambot fs update-file notes/todo.txt "Belajar CRUD + AI"
syambot fs list-folder notes
syambot fs rename notes/todo.txt notes/tugas.txt
syambot fs delete-file notes/tugas.txt
syambot fs delete-folder notes --recursive
```

Catatan:
- Operasi `fs` dibatasi ke folder project saat command dijalankan.
- Hapus folder wajib `--recursive` untuk keamanan.

## Session history

```bash
syambot ask "buat draft caption" --session konten
syambot chat --session konten
```

Riwayat disimpan di:

- `~/.syambot/sessions/<id>.jsonl`

## Environment

- `PUTER_AUTH_TOKEN` (opsional)

## Development

```bash
npm install
npm run check
npm run bot -- help
```

## Release Flow

1. Update `CHANGELOG.md` sesuai perubahan.
2. Naikkan versi:

```bash
npm run release:patch
# atau
npm run release:minor
# atau
npm run release:major
```
