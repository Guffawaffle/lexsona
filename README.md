<div align="center">

# LexSona

## Turn repeated agent corrections into explicit constraints.

LexSona derives scoped, reviewable behavioral constraints from personas and learned rules.

**It returns constraints. It never executes work.**

</div>

## The problem LexSona solves

Some feedback should not have to be repeated in every agent session:

- run the repository's real validation before claiming success;
- keep a maintenance change inside its stated scope;
- prefer a small reversible step when evidence is incomplete;
- apply one working style to implementation and another to product planning.

Instructions can state those expectations. Lex can preserve the decisions and corrections surrounding
the work. LexSona is useful when the expectations should become structured, scoped inputs that a
human or another tool can inspect before work proceeds.

A **persona** describes a decision style. Learned **rules** capture repeated corrections. LexSona
combines the applicable inputs into a **constraint set** for the current project, module, task, and
agent context.

```text
persona + scoped rules + task context → reviewed constraints
                                           ↓
                                  returned to a consumer
```

The consumer decides what to do with that set. LexSona does not call tools, assemble prompts, run
gates, or authorize an agent.

## Where it fits

| Need                                                                          | Use                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| Preserve decisions, blockers, next steps, and repository-aware work context   | [Lex](https://github.com/Guffawaffle/lex)             |
| Derive explicit behavioral constraints from personas and repeated corrections | **LexSona**                                           |
| Coordinate worktrees, attempts, receipts, gates, or agent execution           | [LexRunner](https://github.com/Guffawaffle/lexrunner) |

Lex can run without LexSona. LexSona requires the Lex package and uses Lex's behavioral-rule storage
socket when connected. LexRunner may consume a LexSona constraint set, but LexSona does not depend on
LexRunner and does not become an executor when its output is consumed.

If ordinary repository instructions already express stable working norms clearly, keep them. Add
LexSona when corrections recur, vary by context, need provenance, or should be selected
deterministically instead of pasted into every session.

## See the shape in a few minutes

Install the package in a disposable branch or evaluation workspace:

```bash
npm install @smartergpt/lexsona @smartergpt/lex
```

List the bundled and locally discoverable personas without activating one:

```bash
npx lexsona persona list --json
```

After a human approves a pilot, derive an offline-safe constraint set while keeping the CLI cache in
a temporary directory and deliberately pointing away from any live Lex database:

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

This pilot does not activate a persona, execute work, or write a learned rule. The CLI does write its
last-derived constraint cache, which is why the example redirects that cache to a disposable path.
Because no Lex database is connected, derivation applies the persona's declared confidence ceiling;
the redirected cache records the offline status and ceiling. The persona manifest also carries the
no-memory disclaimer that a consuming host should present when it applies the result.

Constraint selection and input hashing are deterministic for the same validated persona, rules,
context, and configuration. Response metadata such as `derivedAt` is intentionally time-varying, so
complete compatibility `ConstraintSet` responses are not byte-identical. Use
[`ConstraintSnapshot_v1`](docs/constraint-snapshot-v1.md) when a run needs canonical byte-stable
identity, full behavior-bearing source digests, and a bounded projection.

## Let your agent evaluate the fit

If an agent already understands your repository, ask it to inspect whether LexSona belongs in the
workflow before installing or activating anything:

> Read [`docs/agent-evaluation.md`](docs/agent-evaluation.md) and perform only the bounded read-only
> evaluation. Report `adopt`, `pilot`, `defer`, or `not a fit`, with repository evidence. Do not
> install packages, run project code, read environment variables, connect to a Lex database,
> activate a persona, or write learned rules.

The guide keeps the normal report compact. Deeper provenance and diagnostics are requested only when
they would change the decision.

## Choose a surface

### CLI

LexSona uses noun-verb commands:

```bash
lexsona persona list
lexsona persona activate quality-first_engineering
lexsona persona show quality-first_engineering

lexsona rules list
lexsona rules learn "Always run repository validation before committing"

lexsona constraints derive --project my-repo --task implementation
lexsona constraints derive --project my-repo --task implementation --snapshot
lexsona constraints show
lexsona constraints explain

lexsona conflicts check
lexsona db status
lexsona doctor
lexsona trust profile gpt-5-codex
```

Run `lexsona <noun> --help` before scripting a mutating command. Persona activation writes LexSona
configuration; rule learning, teaching, promotion, forgetting, and trust-gap recording mutate the
connected Lex SQLite database.

### TypeScript API

```typescript
import { LexSona } from "@smartergpt/lexsona";

const sona = await LexSona.connect({
  lexDb: "/absolute/path/to/lex.db",
  persona: "quality-first_engineering",
});

const constraints = await sona.deriveConstraints({
  domain: "my-repository",
  module_id: "api",
  taskType: "implementation",
});

const snapshot = await sona.deriveConstraintSnapshot(
  { domain: "my-repository", module_id: "api", taskType: "implementation" },
  { bindings: { workspace: "my-workspace", attempt: "attempt-1" } }
);

sona.close();
```

Use `activate()` for request-local in-process selection. The CLI's `persona activate` command is a
different surface and persists project-local or user-global configuration.

Public package entry points are:

- `@smartergpt/lexsona`
- `@smartergpt/lexsona/rules`
- `@smartergpt/lexsona/persona`

### MCP source adapter

The repository contains a stdio MCP adapter for development and host integration. It is not exposed
as a package binary or public export in the current release. See [README.mcp.md](README.mcp.md) before
using that source-level surface.

## Trust and storage boundaries

LexSona's current connected storage path is a Lex-owned **SQLite file** selected explicitly through
the API or discovered by the compatibility CLI. `LEX_DB_PATH` is a compatibility selector, not an
authorization grant.

Important boundaries:

- persona files and learned rules are inputs to agent behavior; review them as untrusted historical
  input before a consumer applies them;
- derivation performs no network requests and returns data rather than executing it;
- connected construction may create LexSona metadata in the selected SQLite database;
- CLI derivation writes a last-result cache unless `LEXSONA_CONSTRAINTS_CACHE_PATH` redirects it;
- activation and learning commands are explicit mutations;
- the current LexSona connection does not accept Lex 3 trusted workspace authority or a
  PostgreSQL/RLS-scoped store.

Do not treat a database path, environment variable, persona ID, or constraint set as proof that a
caller is authorized for a tenant or workspace. A multi-tenant host should defer connected LexSona
use until it can bind derivation to that host's authorized scope; offline-safe, storage-free
derivation remains a separate option.

## Personas and failure behavior

Persona IDs describe how decisions are made, using the form `{behavioral-focus}_{domain}`:

| Persona ID                  | Optimizes for                         |
| --------------------------- | ------------------------------------- |
| `quality-first_engineering` | correctness, testing, maintainability |
| `momentum-first_product`    | velocity, iteration, shipping         |
| `risk-reducer_operations`   | safety and explicit uncertainty       |

Offline-safe personas declare a `confidence_ceiling` and a `no_memory_disclaimer`. A persona with
`requires_memory: true` fails explicitly when Lex storage is unavailable; LexSona does not silently
substitute a different persona.

Constraint conflicts, staleness, and excess are product risks, not reasons to hide provenance. Keep
sets bounded, review high-impact rules, and use the explanation surface when a constraint affects a
decision.

## Reading paths

Start with the path that matches your role:

- **Considering adoption:** [agent fit evaluation](docs/agent-evaluation.md), then
  [architecture and boundaries](docs/ADR-001-architecture.md).
- **Integrating an agent:** [compact output](docs/COMPACT_FORMAT.md),
  [canonical constraint snapshots](docs/constraint-snapshot-v1.md),
  [error codes](docs/error-codes.md), and [auto-scope](docs/auto-scope.md).
- **Designing personas:** the bundled [`personas/`](personas/) examples and
  [constraint packs](docs/constraint-packs.md).
- **Contributing:** [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the accepted ADR.
- **Developing an MCP host:** [README.mcp.md](README.mcp.md), with its current source-surface warning.

## Non-goals

LexSona does not:

- execute or orchestrate work;
- call tools or run CI gates;
- assemble prompts;
- store Lex Frames;
- authorize tenant or workspace access;
- make network requests during derivation;
- silently activate a persona or substitute one when requirements are unmet.

## License

This repository is **source-available**, not open source.

You may view, fork, modify, and run it for personal, non-commercial use under the
[SmarterGPT Source-Available Personal Use License](./LICENSE.md). Commercial, organizational,
production, hosted-service, redistribution, sublicensing, or embedding use requires a separate
written license from Joseph Gustavson / Guffawaffle / SmarterGPT.
