import { mkdir, readdir, readFile, writeFile, unlink, rm, rename, access } from "node:fs/promises";
import path from "node:path";

const CWD = process.cwd();

function isWithinCwd(targetPath) {
  const rel = path.relative(CWD, targetPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function resolveSafePath(inputPath) {
  if (!inputPath) {
    throw new Error("Path wajib diisi.");
  }

  const resolved = path.resolve(CWD, inputPath);
  if (!isWithinCwd(resolved)) {
    throw new Error("Path di luar folder kerja tidak diizinkan. Gunakan path relatif dari folder project.");
  }

  return resolved;
}

async function ensureNotExists(targetPath) {
  try {
    await access(targetPath);
    throw new Error("Target sudah ada.");
  } catch (err) {
    if (err?.code === "ENOENT") return;
    throw err;
  }
}

function printFsHelp() {
  console.log(`
File/Folder CRUD (relative to current project):
  syambot fs create-file <path> <content>
  syambot fs read-file <path>
  syambot fs update-file <path> <content>
  syambot fs delete-file <path>
  syambot fs create-folder <path>
  syambot fs list-folder [path]
  syambot fs delete-folder <path> --recursive
  syambot fs rename <from> <to>
`);
}

async function runFsCommand(positionals, flags) {
  const action = positionals[1];

  if (!action || action === "help") {
    printFsHelp();
    return;
  }

  if (action === "create-file") {
    const fileArg = positionals[2];
    const content = positionals.slice(3).join(" ");
    if (!fileArg) throw new Error("Path file wajib diisi. Contoh: syambot fs create-file notes/todo.txt \"isi\"");

    const target = resolveSafePath(fileArg);
    await ensureNotExists(target);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    console.log(`File dibuat: ${path.relative(CWD, target)}`);
    return;
  }

  if (action === "read-file") {
    const fileArg = positionals[2];
    if (!fileArg) throw new Error("Path file wajib diisi. Contoh: syambot fs read-file notes/todo.txt");

    const target = resolveSafePath(fileArg);
    const content = await readFile(target, "utf8");
    console.log(content);
    return;
  }

  if (action === "update-file") {
    const fileArg = positionals[2];
    const content = positionals.slice(3).join(" ");
    if (!fileArg) throw new Error("Path file wajib diisi. Contoh: syambot fs update-file notes/todo.txt \"isi baru\"");

    const target = resolveSafePath(fileArg);
    await writeFile(target, content, "utf8");
    console.log(`File diupdate: ${path.relative(CWD, target)}`);
    return;
  }

  if (action === "delete-file") {
    const fileArg = positionals[2];
    if (!fileArg) throw new Error("Path file wajib diisi. Contoh: syambot fs delete-file notes/todo.txt");

    const target = resolveSafePath(fileArg);
    await unlink(target);
    console.log(`File dihapus: ${path.relative(CWD, target)}`);
    return;
  }

  if (action === "create-folder") {
    const dirArg = positionals[2];
    if (!dirArg) throw new Error("Path folder wajib diisi. Contoh: syambot fs create-folder notes/archive");

    const target = resolveSafePath(dirArg);
    await mkdir(target, { recursive: true });
    console.log(`Folder dibuat: ${path.relative(CWD, target)}`);
    return;
  }

  if (action === "list-folder") {
    const dirArg = positionals[2] || ".";
    const target = resolveSafePath(dirArg);
    const entries = await readdir(target, { withFileTypes: true });

    if (entries.length === 0) {
      console.log("(kosong)");
      return;
    }

    for (const entry of entries) {
      const tag = entry.isDirectory() ? "DIR " : "FILE";
      console.log(`[${tag}] ${entry.name}`);
    }
    return;
  }

  if (action === "delete-folder") {
    const dirArg = positionals[2];
    if (!dirArg) throw new Error("Path folder wajib diisi. Contoh: syambot fs delete-folder notes/archive --recursive");
    if (!flags.recursive) throw new Error("Hapus folder butuh --recursive untuk keamanan.");

    const target = resolveSafePath(dirArg);
    await rm(target, { recursive: true, force: false });
    console.log(`Folder dihapus: ${path.relative(CWD, target)}`);
    return;
  }

  if (action === "rename") {
    const fromArg = positionals[2];
    const toArg = positionals[3];
    if (!fromArg || !toArg) throw new Error("Butuh path asal dan tujuan. Contoh: syambot fs rename notes/a.txt notes/b.txt");

    const from = resolveSafePath(fromArg);
    const to = resolveSafePath(toArg);
    await mkdir(path.dirname(to), { recursive: true });
    await rename(from, to);
    console.log(`Dipindah/rename: ${path.relative(CWD, from)} -> ${path.relative(CWD, to)}`);
    return;
  }

  throw new Error("Perintah fs tidak dikenali. Jalankan: syambot fs help");
}

export { runFsCommand };