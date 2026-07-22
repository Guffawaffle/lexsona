#!/usr/bin/env node

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(repositoryRoot, "src", "baseline");
const outputDirectory = resolve(repositoryRoot, "dist", "baseline");

await mkdir(outputDirectory, { recursive: true });
const assetNames = (await readdir(sourceDirectory)).filter((name) =>
  [".yaml", ".yml"].includes(extname(name))
);
await Promise.all(
  assetNames.map((name) => copyFile(resolve(sourceDirectory, name), resolve(outputDirectory, name)))
);
