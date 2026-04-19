# Syambot CLI

AI assistant berbasis terminal yang bisa dijalankan langsung dari command line.

CLI ini sudah menggunakan:
- `commander` untuk parsing command/flag yang lebih rapi
- `chalk` untuk output terminal berwarna agar lebih enak dibaca
- `boxen` untuk hero/help box agar tampilan terminal lebih menarik

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
syambot ask "Buatkan ide konten TikTok tentang AI"
syambot chat
syambot config show
syambot config list-models
syambot config set-model gemma4:e2b
# alias:
syambot a "halo"
syambot c
syambot cfg show
```

Model yang tersedia:

- menyesuaikan model yang sudah kamu download di Ollama lokal
- contoh: `gemma4:e2b`

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
- mengestimasi target file yang paling relevan dari struktur project + prompt user
- menampilkan proses berpikir model secara realtime (jika model mengirim thinking trace)
- setelah selesai, menampilkan ringkasan `Waktu berpikir: n detik`
- mengeksekusi aksi dari output AI jika ada blok aksi valid
- jika model lupa format blok aksi, Syambot akan mencoba auto-fallback untuk mengonversi jawaban jadi blok aksi yang bisa diterapkan

Perintah tambahan di chat:

- `/think` untuk membuka kembali thinking log terakhir (gaya accordion di terminal)
- `--strict-agent` untuk hanya menampilkan jawaban jika perubahan file benar-benar berhasil diterapkan

Contoh:

```bash
syambot chat --strict-agent
```

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

- `OLLAMA_BASE_URL` (opsional, default `http://127.0.0.1:11434`)

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
