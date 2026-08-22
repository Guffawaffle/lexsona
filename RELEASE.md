# LexSona release boundary

LexSona publication is deliberately split between automation and a human maintainer.

## Candidate

After the reviewed release commit is merged to the current `main` tip, dispatch the Release workflow
from `main` with the exact `package.json` version. Branch dispatches and stale `main` revisions fail
closed. A valid dispatch builds, tests, packs, verifies, attests, and retains one candidate tarball plus
`release-candidate.json`. It cannot publish or create a GitHub release.

The receipt binds the package name/version, source commit, tarball SHA-256/SHA-1/SRI/size, each gate's
command, working directory, duration, exit status, and bounded output. The packed-consumer gate installs
the retained tarball with the exact public `@smartergpt/lex@4.0.1` bytes into a disposable consumer.

## Human publication

Download the exact retained candidate and attestation bundle from the successful merged-commit run.
Verify both attestations and the candidate receipt before publishing:

```powershell
gh attestation verify .\smartergpt-lexsona-2.0.0.tgz --repo Guffawaffle/lexsona --signer-workflow Guffawaffle/lexsona/.github/workflows/release.yml --source-digest <commit> --deny-self-hosted-runners --bundle .\release-candidate.attestation.jsonl
gh attestation verify .\release-candidate.json --repo Guffawaffle/lexsona --signer-workflow Guffawaffle/lexsona/.github/workflows/release.yml --source-digest <commit> --deny-self-hosted-runners --bundle .\release-candidate.attestation.jsonl
npm whoami
npm access list packages smartergpt --json
node .\scripts\verify-release-candidate.mjs --check-only
npm publish .\smartergpt-lexsona-2.0.0.tgz --access restricted
npm view @smartergpt/lexsona@2.0.0 version dist.integrity --json
```

Publication remains human-only and 2FA-protected. The workflow has no npm publish step or publish token.
Candidate artifacts rely on this repository remaining private; changing repository visibility requires a
fresh review of private-package artifact exposure.

## Signed tag and GitHub release

Only after npm publication succeeds, create and push the repository-approved annotated signed tag for
the same commit. The tag workflow fails closed unless all of these are true:

- the tag exactly matches `package.json`;
- the tag is annotated and signed by a fingerprint in `TRUSTED_RELEASE_FINGERPRINTS`, using public keys
  supplied through `TRUSTED_GPG_KEYS`;
- the tag target is the workflow commit and is contained in `origin/main`;
- the rebuilt retained candidate and receipt verify and their GitHub attestations bind to that commit;
- private npm, read with `NPM_READ_TOKEN`, reports the exact retained candidate integrity.

Only then may the workflow create the non-draft GitHub release. `NPM_READ_TOKEN` needs read access only;
publish authority does not belong in GitHub Actions.
