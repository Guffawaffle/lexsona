#!/usr/bin/env node

import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await Promise.all([
  rm(resolve(repositoryRoot, "dist"), { recursive: true, force: true }),
  rm(resolve(repositoryRoot, "tsconfig.build.tsbuildinfo"), { force: true }),
]);
