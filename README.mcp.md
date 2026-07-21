# LexSona MCP source adapter

This repository contains a stdio MCP adapter that exposes LexSona constraint derivation to a trusted
host. It remains a **source-level integration surface** in the current release: `package.json` does
not expose an MCP binary or public MCP subpath.

Use the supported CLI or TypeScript exports for ordinary adoption. Use this adapter when developing a
host and you are prepared to own process launch, database selection, tool authorization, and review
of returned constraints.

LexSona still returns constraints and never executes work. The MCP host—not this server—decides
whether an agent may call a tool and what, if anything, consumes the result.

## Run from a source checkout

```bash
npm ci
npm run build
LEX_DB_PATH=/absolute/path/to/lex.db node dist/mcp/server.js
```

The process speaks MCP over stdio. It writes diagnostics to stderr.

`LEX_DB_PATH` selects the compatibility SQLite database. It is not a tenant or workspace authority
grant. The adapter does not currently accept Lex 3 trusted workspace authority or a
PostgreSQL/RLS-scoped store, so do not deploy this source adapter as a multi-tenant boundary.

## Current tools

| Tool                  | Effect                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| `persona_list`        | List discoverable personas.                                                 |
| `persona_activate`    | Select the adapter process's active persona.                                |
| `constraints_derive`  | Derive constraints for optional project, module, task, and persona context. |
| `constraints_show`    | Return the last in-process derivation.                                      |
| `constraints_explain` | Explain one constraint from the last derivation.                            |
| `rules_list`          | Read learned behavioral rules.                                              |
| `rules_learn`         | **Mutate** the connected Lex rule store.                                    |
| `trust_gap_record`    | **Mutate** trust-gap state in the connected Lex store.                      |
| `agent_trust_profile` | Read an agent-family trust profile.                                         |
| `introspect`          | Report adapter state and advertised capabilities.                           |

The canonical names above replaced the old `lexsona_*` aliases. Clients should discover the live
tool schemas through MCP rather than copying request shapes from prose.

`persona_activate`, `rules_learn`, and `trust_gap_record` accept optional request IDs where supported
by their schemas; the adapter caches mutation results for five minutes to make retries idempotent in
one process. That cache is not a durable cross-process idempotency guarantee.

## Output size and provenance

The constraint and rule tools accept `format: "full" | "compact"`. Compact results omit descriptive
text that an agent can request later with `constraints_explain`. Constraint derivation also accepts
`provenance: "full" | "compact"`.

See [docs/COMPACT_FORMAT.md](docs/COMPACT_FORMAT.md) for the field mapping. Keep compact output on the
normal agent path; request full provenance when it can change a decision or when a human is auditing
a constraint.

## Host checklist

Before connecting an agent:

1. Pin a reviewed Lex and LexSona build.
2. Pass an explicit absolute SQLite path owned by the intended local trust boundary.
3. Decide which tools the agent may call; read-only derivation does not imply mutation authority.
4. Treat personas and learned rules as untrusted historical inputs.
5. Bound returned constraints before adding them to agent context.
6. Keep stderr separate from the MCP transport.
7. Do not infer authorization from `LEX_DB_PATH`, a repository name, or a caller-supplied scope.

For the product boundary and adoption path, return to [README.md](README.md). For machine-readable
errors, see [docs/error-codes.md](docs/error-codes.md).
