#!/usr/bin/env node

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
  npm publish ./smartergpt-lexsona-2.0.0.tgz --access restricted
  npm view @smartergpt/lexsona@2.0.0 version dist.integrity --json

Only after npm integrity matches may a signed v2.0.0 tag create the GitHub release. Nothing was published.`);

process.exit(1);
