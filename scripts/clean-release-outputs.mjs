#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function assertSafeTree(canonicalRoot, target, label) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not contain links or junctions`);
  const relative = path.relative(canonicalRoot, fs.realpathSync(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the physical repository root`);
  }
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) {
      assertSafeTree(canonicalRoot, path.join(target, name), label);
    }
  }
}

export function cleanReleaseOutputs(repoRoot) {
  const resolvedRoot = path.resolve(repoRoot);
  const canonicalRoot = fs.realpathSync(resolvedRoot);
  for (const name of ["dist", "tsconfig.tsbuildinfo", "tsconfig.build.tsbuildinfo"]) {
    const target = path.join(resolvedRoot, name);
    if (!fs.existsSync(target)) continue;
    assertSafeTree(canonicalRoot, target, name);
    fs.rmSync(target, { recursive: true, force: true });
  }
}

const scriptPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (scriptPath === import.meta.url) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  cleanReleaseOutputs(repoRoot);
  console.log("Cleaned generated LexSona release outputs");
}
