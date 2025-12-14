# ADR-001: LexSona Architecture and Boundaries

**Status:** Accepted  
**Date:** 2025-12-05  
**Decision Makers:** Guff, Lex

## Context

LexSona was extracted from Lex to maintain clear separation of concerns. During the extraction, we identified the need to lock in firm architectural boundaries to prevent scope creep.

## Decision

### Dependency Chain

```
Lex can run by itself.
LexSona needs Lex.
LexRunner needs both.
```

This is the **canonical layering** and is non-negotiable.

### Layer Responsibilities

| Layer                           | Responsibility                                                           | Does NOT Do                                   |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| **Lex** (OSS core)              | Frames/memory, policy/contracts, behavioral rules storage + retrieval    | Interpret or enforce rules                    |
| **LexSona** (constraint engine) | Interpret stored rules, manage persona/mode mechanics, run learning loop | Execute, tool-call, gate, or assemble prompts |
| **LexRunner**                   | Execution layer, gates that apply constraints in real workflows          | Store memory, define personas                 |

### The Socket Model

Lex provides the **socket** for LexSona:

```typescript
// Lex exposes (socket)
interface LexBehavioralSocket {
  recordCorrection(correction: Correction): Promise<void>;
  getRules(scope: RuleScope): Promise<BehaviorRule[]>;
  // baseline.yaml constraints are read from canon/
}

// LexSona consumes (plug)
interface LexSona {
  connect(config: { lexDb: string }): Promise<LexSona>;
  activate(personaId: string): Promise<void>;
  deriveConstraints(context: DeriveContext): Promise<ConstraintSet>;
  learn(correction: CorrectionInput): Promise<void>;
}
```

LexSona **plugs into** Lex's socket. It never duplicates storage or query logic.

### Naming Convention

To maintain clear behavioral classification, LexSona uses **decision-style naming** for persona IDs. This convention describes _how_ an agent approaches decisions rather than _what_ it is.

**Format:** `{behavioral-focus}_{domain}`

| Persona ID                  | Behavioral Focus                               |
| --------------------------- | ---------------------------------------------- |
| `quality-first_engineering` | Prioritizes thoroughness, testing, correctness |
| `momentum-first_product`    | Prioritizes velocity, shipping, iteration      |
| `risk-reducer_operations`   | Prioritizes safety, asks when uncertain        |

**Approved Behavioral Patterns:**

- `quality-first`
- `momentum-first`
- `risk-reducer`
- `scope-warden`
- `test-first`
- `observability-first`
- `minimal-diff`
- `user-advocate`

## Non-Goals (Firm)

LexSona does **NOT** do:

| ❌ Non-Goal                            | Why                                   |
| -------------------------------------- | ------------------------------------- |
| **Execution**                          | That's LexRunner                      |
| **Tool calling**                       | That's LexRunner                      |
| **Prompt assembly**                    | That's the consuming agent            |
| **Gates/CI execution**                 | That's LexRunner                      |
| **Frame storage**                      | That's Lex                            |
| **Network requests during derivation** | Constraints must be derivable offline |
| **Universal export format**            | No "constraint packs for any runtime" |
| **Runtime auto-detection**             | Caller declares connection state      |
| **Silent fallback**                    | Connected personas fail explicitly    |

## Developer Notes: Local Testing and Disconnected Mode

Key principles for local testing and disconnected operation:

1. **Disconnected mode is first-class** — Constraint derivation without a Lex DB is valid behavior, not a fallback.

2. **Offline-safe personas must declare safety parameters** — `confidence_ceiling` and `no_memory_disclaimer` are required when `requires_memory: false`.

3. **No export/adapter commitments** — LexSona does not provide serialization for "any runtime." Personas are `.yaml` files; runtimes read them directly.

4. **Local testing is a separate initiative** — See `lex/docs/stash/local-testing/` for the stashed local testing plan. It is explicitly deferred and does not affect LexSona's core design.

5. **Hard selection rule** — If `requires_memory: true` and no Lex connection, `deriveConstraints()` throws `PersonaRequiresMemoryError`. No silent substitution.

## Consequences

1. **LexSona remains small and focused** - it's a constraint derivation engine, nothing more
2. **Clean separation enables independent versioning** - Lex, LexSona, LexRunner can evolve at different paces
3. **Behavioral naming provides clarity** - users and agents understand what decision-making style to expect

## Implementation Notes

### Files in Lex (Socket)

- `src/memory/store/lexsona-types.ts` - Type definitions
- `src/memory/store/lexsona-queries.ts` - CRUD operations
- `canon/constraints/baseline.yaml` - Neutral baseline constraints

### Files in LexSona (Plug)

- `src/core/lexsona.ts` - Main class
- `src/persona/types.ts` - Persona definitions
- `src/constraints/derive.ts` - Constraint derivation engine
- `src/rules/types.ts` - Rule types (mirrors Lex's)

## Review

This ADR should be reviewed if:

- The dependency chain needs to change
- New non-goals emerge
- The naming convention proves inadequate
