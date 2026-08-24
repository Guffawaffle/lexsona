#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const tarball = `smartergpt-lexsona-${version}.tgz`;

console.error(`LEXSONA_NPM_PUBLISH_REQUIRES_HUMAN

LexSona refuses to publish through "npm run release".

An agent may run:
  npm run release:dry-run

After the reviewed release commit is merged and its workflow has retained a candidate,
the authenticated maintainer verifies the workflow's artifact ID and pinned-action-computed,
service-recorded SHA-256, downloads that exact immutable artifact, and verifies its receipt,
then publishes the receipt-named tarball with:
  npm whoami
  npm access list packages smartergpt --json
  node scripts/verify-release-candidate.mjs --check-only
  npm publish ./${tarball} --access restricted
  npm view @smartergpt/lexsona@${version} version dist.integrity --json

Only after npm integrity matches may a signed v${version} tag create the GitHub release. Nothing was published.`);

process.exit(1);
