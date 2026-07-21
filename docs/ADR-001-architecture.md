# ADR-001: LexSona architecture and boundaries

**Status:** Accepted  
**Date:** 2025-12-05  
**Decision makers:** Guff, Lex

## Context

LexSona was extracted from Lex so that remembering work, interpreting behavioral rules, and executing
agent workflows would not collapse into one authority surface. The separation matters most when a
persona or learned correction influences an agent: behavioral input must remain inspectable, scoped,
and distinct from permission to act.

## Decision

LexSona is a deterministic constraint engine. It combines a validated persona, applicable Lex-owned
rules, baseline principles, and caller-supplied context into a constraint set. It returns that set to
a consumer and does nothing with it.

```text
Lex storage socket ─┐
persona + baseline ─┼─→ LexSona derivation ─→ constraint set ─→ consumer
caller context ─────┘
```

The consumer may be a human, an agent host, or LexRunner. Consumption does not transfer execution,
authorization, prompt assembly, or gate ownership into LexSona.

### Layer responsibilities

| Layer         | Responsibility                                                               | Does not do                                                            |
| ------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Lex**       | Frames, work context, policy contracts, and the behavioral storage socket    | Interpret personas or execute derived constraints                      |
| **LexSona**   | Load personas, interpret stored rules, derive and explain scoped constraints | Execute work, call tools, run gates, assemble prompts, or store Frames |
| **LexRunner** | Optionally coordinate work and consume constraints in an execution workflow  | Define LexSona personas or own Lex memory                              |

Lex is independently useful. LexSona requires the Lex package. LexRunner is an optional consumer, not
a prerequisite for derivation.

### Storage socket

LexSona imports behavioral APIs through `@smartergpt/lex/lexsona`, including correction recording,
rule retrieval, persona persistence, and their types. LexSona may wrap those APIs but must not fork
their durable semantics.

The current connected adapter opens a Lex SQLite file. Its path may be supplied to `LexSona.connect()`
or selected by compatibility discovery. A path and `LEX_DB_PATH` are storage selectors, not tenant or
workspace authority. This adapter does not currently consume Lex 3 trusted workspace scope or a
PostgreSQL/RLS-scoped store.

Any future shared or multi-tenant connection must add an explicit trusted-scope binding without
making environment variables authoritative and without weakening Lex's ownership of storage.

### Determinism

For the same validated persona, rules, baseline, context, and derivation configuration, LexSona must
select and order the same constraints and produce the same input hash. Operational metadata such as
`derivedAt` may vary, so the complete result object is not required to be byte-identical.

Derivation performs no network requests. Offline-safe personas declare a confidence ceiling and a
no-memory disclaimer. A persona with `requires_memory: true` fails explicitly when no Lex connection
is available; LexSona never silently substitutes a persona.

### Naming

Persona IDs use decision-style names in the form `{behavioral-focus}_{domain}`. The name describes
how an agent approaches decisions rather than a job title or fictional identity. Examples include
`quality-first_engineering` and `momentum-first_product`.

### Public and integration surfaces

The supported package entry points are the root export plus `/rules` and `/persona`. The `lexsona`
CLI is public and uses noun-verb commands.

The stdio MCP adapter is maintained in source for trusted-host development, but the current package
does not expose it as a binary or public subpath. Hosts using it own launch, tool authorization,
database selection, and result consumption.

## Non-goals

LexSona does not own:

- execution or orchestration;
- tool calls, CI, or gates;
- prompt assembly;
- Frame storage;
- tenant or workspace authorization;
- network access during derivation;
- automatic persona activation or fallback;
- universal runtime adapters.

## Consequences

- Consumers can review constraints independently of the mechanism that may apply them.
- Lex remains useful without persona interpretation.
- Connected derivation inherits the trust boundary of its explicitly selected Lex SQLite database.
- Multi-tenant connected use remains deferred until a trusted scoped adapter exists.
- Offline-safe derivation can be evaluated without storage, but it has a declared confidence ceiling
  and cannot learn from prior corrections.
- New CLI, MCP, or LexRunner features must preserve the distinction between behavioral guidance and
  authority.

## Review triggers

Review this decision if:

- LexSona accepts a trusted Lex 3 runtime scope or PostgreSQL backend;
- a public MCP package surface is introduced;
- constraint consumption moves into this package;
- deterministic-selection requirements change;
- persona naming or offline safety proves inadequate.
