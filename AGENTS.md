# AGENTS.md — LexSona

> **North star:** Provide scoped behavioral constraints for AI agents. Return constraints; never
> execute work.

Read [README.md](README.md) for the adoption story and
[docs/ADR-001-architecture.md](docs/ADR-001-architecture.md) for the accepted boundary.

## Core invariants

1. **Constraint engine, not executor.** LexSona does not call tools, run gates, orchestrate work, or
   assemble prompts.
2. **Lex owns behavioral storage.** LexSona consumes the `@smartergpt/lex/lexsona` socket for learned
   rules and personas; it does not own Frame storage.
3. **Deterministic selection.** The same validated persona, rules, context, and configuration select
   the same constraints and input hash. Time metadata such as `derivedAt` may differ.
4. **Scoped by design.** Project, module, task, environment, agent-family, procedure, file, and tag
   inputs must not broaden a rule's intended scope.
5. **Explicit failure.** A persona that requires memory fails when no Lex connection exists. Never
   silently substitute another persona.
6. **No network during derivation.** Persona and rule interpretation must remain local and
   inspectable.

## Ecosystem responsibilities

```text
Lex       → work context, policy, and behavioral storage socket
LexSona   → persona and rule interpretation; constraint derivation
LexRunner → optional consumer that coordinates or executes work
```

Lex can run without LexSona. LexSona requires the Lex package even when it uses an offline-safe
persona. LexRunner may consume returned constraints; that does not give LexSona execution authority.

## Current public surfaces

The package exports:

- `@smartergpt/lexsona` — `LexSona`, constraint derivation, trust calibration, types, and errors;
- `@smartergpt/lexsona/rules` — rule utilities;
- `@smartergpt/lexsona/persona` — persona utilities.

The `lexsona` binary uses noun-verb syntax:

| Noun or command | Current operations                            |
| --------------- | --------------------------------------------- |
| `persona`       | `list`, `activate`, `show`, `deactivate`      |
| `rules`         | `list`, `learn`, `teach`, `promote`, `forget` |
| `constraints`   | `derive`, `show`, `explain`                   |
| `conflicts`     | `check`                                       |
| `db`            | `status`                                      |
| `trust`         | `profile`, `gap`                              |
| `doctor`        | repository and connection diagnostics         |

The stdio MCP adapter under `src/mcp/` is present for source-level host integration but is not a
package binary or public export. Keep [README.mcp.md](README.mcp.md) honest about that status.

## Storage and authority

The canonical connected runtime consumes Lex's `BehavioralStoreBinder` and immutable
`BehavioralStoreBindingV1`. Lex owns capability enforcement, SQLite/PostgreSQL persistence, and
PostgreSQL RLS. LexSona must receive scoped services rather than a driver, pool, client, query
surface, or path. It never mints or widens authority.

The explicit `lexDb` adapter and `LEX_DB_PATH`/cwd/home discovery remain deprecated compatibility
surfaces at the trusted CLI/source-MCP bootstrap edge only. Paths and environment variables select
legacy storage; they do not prove tenant or workspace authority. Never add local fallback after a
scoped binding fails.

Do not represent LexSona itself as a multi-tenant authorization boundary. It preserves the Lex
binding and consumes the resulting filtered data; the host, Lex, database identities, and RLS remain
independent enforcement points.

Mutations must remain obvious:

- CLI persona activation writes project-local or user-global LexSona configuration;
- CLI derivation writes a last-result cache;
- learning, teaching, promotion, forgetting, and trust-gap recording mutate Lex storage;
- in-process `activate()` changes only that instance's selection.

## Persona naming

Persona IDs describe how decisions are made:

```text
{behavioral-focus}_{domain}
```

Examples include `quality-first_engineering`, `momentum-first_product`, and
`risk-reducer_operations`. Prefer behavioral patterns such as `quality-first`, `momentum-first`,
`risk-reducer`, `scope-warden`, `test-first`, `observability-first`, `minimal-diff`, and
`user-advocate`.

Offline-safe personas must declare both `confidence_ceiling` and `no_memory_disclaimer`.

## Coding and verification

- TypeScript, strict validated inputs, and Zod schemas.
- Commander noun-verb CLI conventions.
- Vitest tests; keep fixtures under `tests/fixtures/`.
- Read before editing and keep one change inside its owning issue.
- Never weaken the non-execution boundary to make an integration convenient.
- Update user, agent, and protocol documentation when a public surface changes.
- Export new public types from the nearest owning `index.ts` surface.

Run the checks proportionate to the change:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Related documents

- [README.md](README.md) — story, fit, surfaces, and trust boundary
- [docs/agent-evaluation.md](docs/agent-evaluation.md) — bounded read-only adoption assessment
- [docs/ADR-001-architecture.md](docs/ADR-001-architecture.md) — accepted layer decision
- [CONTRIBUTING.md](CONTRIBUTING.md) — repository workflow
- [README.mcp.md](README.mcp.md) — source-level MCP adapter
