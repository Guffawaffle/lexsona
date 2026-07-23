# Should this repository use LexSona?

Use this guide when an AI agent already understands a repository and a human wants a bounded fit
assessment. The evaluation is read-only. It does not install LexSona, execute project code, inspect
ambient secrets, connect to storage, or change agent behavior.

## Evaluation boundary

The evaluator may read tracked repository files and already-available local Git history. It may use
issue or review evidence only when that material has been explicitly supplied or is already available
through an authorized read-only connection.

Do not:

- install dependencies or run repository scripts;
- read environment-variable values, credentials, home-directory configuration, or database files;
- create `.smartergpt` files, activate a persona, derive through the CLI, or record a correction;
- infer tenant or workspace authority from a path, environment variable, repository remote, or name;
- recommend an enforcement role for LexSona—it returns constraints and never executes work.

## What to inspect

### 1. Repeated corrections

Look for concrete evidence that agents repeatedly need the same behavioral correction: review notes,
handoff documents, contribution rules, recurring failure patterns, or duplicated prompt instructions.
Separate stable working norms from one-off task decisions.

### 2. Existing controls

Inventory repository instructions, policy files, linters, tests, CI gates, and agent configuration.
State which needs are already solved. A static instruction or deterministic code gate is usually
better than a behavioral constraint when it fully expresses the requirement.

### 3. Selection and consumption

Identify where a constraint set would be derived, reviewed, and consumed. Name the context needed for
selection—such as project, module, task type, agent family, or procedure—and who remains responsible
for execution or enforcement.

### 4. Storage and authority

Decide whether an offline-safe persona is enough or whether learned rules are necessary. Canonical
connected LexSona requires an explicit Lex behavioral-store binder, immutable runtime binding, and
persona reference. It accepts Lex's SQLite or PostgreSQL implementation without receiving a raw
database client. Treat missing authenticated binding or unsupported database enforcement as a
blocker for multi-tenant connected use.

### 5. Constraint quality risks

Check for likely stale, conflicting, over-broad, excessive, or performative constraints. Prefer a
small set whose effect can be observed. Flag any rule that could cause an agent to exceed scope,
bypass human approval, expose secrets, or mistake guidance for authority.

## Choose an outcome

- **Adopt** — repeated corrections are evidenced, existing controls do not solve them, the consumer
  and review owner are clear, and current storage boundaries fit.
- **Pilot** — the value is plausible but one bounded, reversible experiment is needed.
- **Defer** — the use case is real, but authority, storage, ownership, or integration prerequisites
  are missing.
- **Not a fit** — existing instructions and deterministic gates already solve the problem, or there
  is no recurring behavioral signal worth formalizing.

## Required report

Keep the normal response under 500 words:

```text
Decision: adopt | pilot | defer | not a fit

Evidence
- <path or supplied review/issue reference>: <what it demonstrates>

Overlap
- <existing instruction, policy, or gate that already covers part of the need>

Candidate constraints
- <at most five; include proposed scope and why each is behavioral rather than executable policy>

Consumption and ownership
- Deriver: <where derivation would occur>
- Reviewer: <human or trusted host boundary>
- Consumer: <agent, host, or LexRunner surface>

Risks and uncertainty
- <staleness, conflict, scope, storage, authority, or missing evidence>

Smallest next step
- <no-op if not a fit; prerequisite if deferred; reversible pilot if warranted>
```

Do not include exhaustive file inventories, dependency trees, raw constraint payloads, or storage
topology in the normal report. Add a `Diagnostics` section only when the human requests it or when a
specific uncertainty would change the decision.

## Optional pilot, only after approval

The smallest current pilot uses one bundled offline-safe persona, no live Lex database, no activation,
and a disposable CLI cache:

```bash
tmp="$(mktemp -d)"
LEX_DB_PATH="$tmp/missing.db" \
LEXSONA_CONSTRAINTS_CACHE_PATH="$tmp/constraints.json" \
  npx lexsona constraints derive \
    --persona quality-first_engineering \
    --project your-repository \
    --task implementation \
    --json
rm -rf "$tmp"
```

Run it only in a disposable branch or evaluation workspace after the human approves dependency
installation and execution. Review the derived set; do not feed it into an agent or LexRunner during
the first pass. The pilot succeeds only if it produces a small, relevant set that improves a real
decision without duplicating repository policy.
