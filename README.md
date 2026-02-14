# Syambot CLI

AI assistant berbasis terminal yang bisa dijalankan langsung dari command line.

## Install

```bash
npm i -g syambot-cli
```

## Usage

```bash
syambot help
syambot login
syambot ask "Buatkan ide konten TikTok tentang AI"
syambot chat
syambot config show
```

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

3. Push commit + tag:

```bash
git push origin main --follow-tags
```

4. Publish ke npm:

```bash
npm whoami
npm publish --access public
```

## Upload ke GitHub

```bash
git add .
git commit -m "chore: prepare release"
git push origin main
```