import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const nodeBin = process.execPath;

export function fixturePath(name) {
  return resolve(repoRoot, "tests", "fixtures", name);
}

export function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

export function runNode(args, options = {}) {
  return execFileSync(nodeBin, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
}

export function runBash(scriptPath, args = [], options = {}) {
  const result = spawnSync("bash", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });

  return result;
}

export function writeExecutable(path, contents) {
  writeFileSync(path, contents, { mode: 0o755 });
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}
