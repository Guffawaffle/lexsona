# LexSona release boundary

LexSona publication is deliberately split between automation and a human maintainer.

## Candidate

After the reviewed release commit is merged to the current `main` tip, dispatch the Release workflow
from `main` with the exact `package.json` version. Branch dispatches and stale `main` revisions fail
closed. A valid dispatch builds, tests, packs, verifies, and retains one candidate tarball plus
`release-candidate.json` in an immutable Actions artifact. The run summary records that artifact's
unique ID, authenticated URL, and pinned-action-computed, service-recorded SHA-256. Dispatch cannot
publish or create a GitHub release.

The receipt binds the package name/version, source commit, tarball SHA-256/SHA-1/SRI/size, each gate's
command, working directory, duration, exit status, and bounded output. The packed-consumer gate installs
the retained tarball with the exact public `@smartergpt/lex@4.0.1` bytes into a disposable consumer.

## Human publication

From a clean checkout of the receipt's exact merged commit, inspect the successful run summary and
verify its artifact ID, name, service-recorded SHA-256, run ID, and expiry state before downloading the
artifact. Then verify the candidate receipt before publishing:

```powershell
$artifact = gh api repos/Guffawaffle/lexsona/actions/artifacts/<artifact-id> | ConvertFrom-Json
$artifact | Select-Object id, name, digest, expired, workflow_run
gh run download <run-id> --repo Guffawaffle/lexsona --name npm-candidate-<commit>
npm whoami
npm access list packages smartergpt --json
node .\scripts\verify-release-candidate.mjs --check-only
npm publish .\smartergpt-lexsona-2.0.0.tgz --access restricted
npm view @smartergpt/lexsona@2.0.0 version dist.integrity --json
```

Publication remains human-only and 2FA-protected. The workflow has no npm publish step or publish token.
Candidate artifacts rely on this repository remaining private; changing repository visibility requires a
fresh review of private-package artifact exposure.

GitHub artifact attestations are not available for user-owned private repositories without Enterprise
Cloud. This repository therefore uses the immutable Actions artifact service record as its transport
boundary. The pinned upload action returns the unique artifact ID and SHA-256; tag workflows query that
exact ID, require its name/digest/run identity to match, download by ID with digest mismatch configured
to fail, and then verify the receipt's commit and tarball hashes. Moving the repository to an eligible
GitHub plan may justify adding attestations later, but attestation availability is not represented today.

## Signed tag and GitHub release

Only after npm publication succeeds, create and push the repository-approved annotated signed tag for
the same commit. The tag workflow fails closed unless all of these are true:

- the tag exactly matches `package.json`;
- the tag is annotated and signed by a fingerprint in `TRUSTED_RELEASE_FINGERPRINTS`, using public keys
  supplied through `TRUSTED_GPG_KEYS`;
- the tag target is the workflow commit and is contained in `origin/main`;
- the rebuilt candidate's immutable artifact ID, service-recorded SHA-256, workflow run, receipt, and
  tarball all bind to that commit;
- private npm, read with `NPM_READ_TOKEN`, reports the exact retained candidate integrity.

Only then may the workflow create the non-draft GitHub release. `NPM_READ_TOKEN` needs read access only;
publish authority does not belong in GitHub Actions.
