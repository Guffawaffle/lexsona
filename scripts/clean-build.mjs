#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanReleaseOutputs } from "./clean-release-outputs.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

cleanReleaseOutputs(repositoryRoot);
