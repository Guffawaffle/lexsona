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
the retained tarball with the exact public `@smartergpt/lex@4.0.3` bytes into a disposable consumer.

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
$version = (Get-Content -Raw .\package.json | ConvertFrom-Json).version
npm publish ".\smartergpt-lexsona-$version.tgz" --access public
npm view "@smartergpt/lexsona@$version" version dist.integrity --json
```

Publication remains human-only and 2FA-protected. The workflow has no npm publish step or publish token.
Public release candidates must contain only redistributable material. Before changing repository
visibility, review retained artifacts, workflow logs and repository history; prior private access
is no longer a confidentiality boundary after that change.

The candidate transport uses the immutable Actions artifact service record. The pinned upload
action returns the unique artifact ID and SHA-256; tag workflows query that exact ID, require
its name/digest/run identity to match, download by ID with digest verification, and then verify
the receipt's commit and tarball hashes. Public visibility does not replace these integrity checks
and this workflow does not currently produce artifact attestations.

## Signed tag and GitHub release

Only after npm publication succeeds, create and push the repository-approved annotated signed tag for
the same commit. The tag workflow fails closed unless all of these are true:

- the tag exactly matches `package.json`;
- the tag is annotated and signed by a fingerprint in `TRUSTED_RELEASE_FINGERPRINTS`, using public keys
  supplied through `TRUSTED_GPG_KEYS`;
- the tag target is the workflow commit and is contained in `origin/main`;
- the rebuilt candidate's immutable artifact ID, service-recorded SHA-256, workflow run, receipt, and
  tarball all bind to that commit;
- the public npm registry reports the exact retained candidate integrity.

Only then may the workflow create the non-draft GitHub release. Public verification requires no
npm read credential; publish authority does not belong in GitHub Actions. Earlier package versions
retain their published license terms even after registry access becomes public.

## Already-published verification and release recovery

Candidate dispatch retains the npm publication dry-run gate. A tag rebuild instead records the
distinct `npm-published-integrity` gate: the existing public version and integrity must match the
rebuilt tarball. npm may reject even a dry-run publication of an existing version, so a successful
public integrity check must not be represented as a dry-run publish result. All preceding package
and consumer gates remain required.

For an immutable tag whose historical workflow failed after npm publication, dispatch
`complete-published-release.yml` from current `main` with the existing tag, the successful original
Release candidate dispatch run ID, and its immutable artifact ID. Recovery verifies the authorized
tag signature and main containment, the successful candidate run/source identity, the artifact
service SHA-256 against downloaded archive bytes, the commit-bound receipt and tarball, and the
public npm integrity. A separate write job rechecks the exact remote tag object before creating
GitHub release metadata. Recovery neither republishes npm bytes nor moves the existing tag. It
requires the retained original candidate to remain available; expiry is a blocker, not permission
to substitute another artifact.
