# ConstraintSnapshot_v1

`ConstraintSnapshot_v1` is LexSona's canonical, schema-versioned behavioral output for agent runs.
It binds the selected guidance to the persona, baseline, rule set, constraint packs, derivation
context, and optional caller identifiers. It returns constraints only. It is never an authority
token, credential, command wrapper, or permission grant.

## Deterministic identity

The snapshot uses canonical JSON (recursively sorted object keys) and tagged SHA-256 digests.
Constraints are ordered by severity, ID, and text; principles and unordered context collections
are also normalized. Runtime observation time and the legacy `ConstraintSet.derivedAt` value do
not participate. A timestamp is included in identity only when the caller explicitly supplies
`canonicalTimestamp`; LexSona normalizes it to UTC.

`contentDigest` covers all behavior-bearing snapshot content, including schema and engine
versions, identity bindings, source revisions and full-content digests, derivation limits,
requested/effective scope, constraints, principles, and bounded resolution summaries. The
derived compact projection and optional diagnostic provenance reference do not change behavioral
identity.

Agent family, runtime family, and host-declared capability observations are applicability inputs,
not authority. They are normalized into derivation context. Bounded applicability omissions are
also identity-bearing so two workers cannot claim the same snapshot after selecting different
procedural guidance.

The public API exports:

- `ConstraintSnapshotV1Schema` (Zod)
- `CONSTRAINT_SNAPSHOT_V1_JSON_SCHEMA` (JSON Schema draft 2020-12, generated from Zod)
- `createConstraintSnapshotV1()` and `LexSona.deriveConstraintSnapshot()`
- `parseConstraintSnapshotV1()` and `serializeConstraintSnapshotV1()`
- canonicalization and digest helpers

For an evidence-bearing scoped-store read, use `LexSona.deriveScopedConstraintReceipt()`. Its
`ScopedConstraintReceipt_v1` wrapper binds the exact read-only Lex authority scope, selected store
persona revision, behavioral snapshot revision/content digest, and the complete canonical snapshot.
The wrapper's digest includes diagnostic provenance that `ConstraintSnapshot_v1.contentDigest`
deliberately excludes. Legacy CLI/MCP snapshot fields remain descriptive and are not a substitute
for this explicit scoped receipt.

Consumers must reject unsupported schema versions. The v1 parser uses an exact major-version
literal and therefore fails closed on unknown majors.

## Authority boundary

`authority.grantsAuthority` is always `false`. Persona scope is a behavioral access request, not
proof that access exists. Tenant, workspace, repository-instance, run, attempt, worker-role,
model-family, task, and phase bindings describe the caller-authorized context but cannot mint
permissions.

When an actual sandbox or broker supplies an `authorityCeiling`, LexSona computes an
`effectiveScope` conservatively:

- requested read/write patterns must exactly exist in the ceiling;
- deny patterns are unioned and can only become more restrictive;
- cross-repository access requires both the request and ceiling to allow it;
- rejected requests are reported explicitly.

LexSona does not interpret that result as enforcement. The execution environment remains
responsible for enforcing its own independently authorized ceiling.

## Bounded output and diagnostics

The canonical snapshot has hard collection and text limits and fails rather than silently losing
behavioral content. Its embedded `compact` projection includes at most 20 constraints and 12
principles and reports omitted counts. Contradictions and excluded rules use counts plus bounded
samples. Applicability diagnostics report a count plus at most 12 reasons. Full provenance remains
opt-in and out of band through `diagnostics.provenanceRef`.

## CLI and MCP

Emit canonical single-line JSON from the CLI:

```bash
lexsona constraints derive --persona quality-first_engineering --snapshot \
  --agent-family coding-agent --runtime-family generic-host \
  --runtime-capability structured-edit \
  --workspace my-workspace --repository-instance my-repo --run run-42 --attempt attempt-1
```

The same contract is available from MCP `constraints_derive` with
`contract: "snapshot-v1"`. Set `format: "compact"` to return only the bounded embedded
projection. The default remains `constraint-set-v1` for compatibility.

## ConstraintSet compatibility

`ConstraintSet` remains the default return type of `deriveConstraints()`, the default CLI JSON
shape, and the default MCP response. Its `derivedAt`, `inputHash`, cache shape, show command, and
explain command are unchanged. The input hash now binds full behavior-bearing inputs and
applicability context, but the compatibility object remains operational rather than canonical
because `derivedAt` is intentionally time-varying.

New run protocols should use `ConstraintSnapshot_v1`. Existing integrations can migrate
explicitly without a flag day by choosing `--snapshot`, MCP `contract: "snapshot-v1"`, or the new
library method.
