#!/usr/bin/env node

import { access, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = resolve(repositoryRoot, "dist", "cli", "lexsona.js");

await access(cliPath);
if (process.platform !== "win32") {
  await chmod(cliPath, 0o755);
}
