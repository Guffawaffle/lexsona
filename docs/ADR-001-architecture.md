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

| Layer | Responsibility | Does NOT Do |
|-------|---------------|-------------|
| **Lex** (OSS core) | Frames/memory, policy/contracts, behavioral rules storage + retrieval | Interpret or enforce rules |
| **LexSona** (constraint engine) | Interpret stored rules, manage persona/mode mechanics, run learning loop | Execute, tool-call, gate, or assemble prompts |
| **LexRunner** | Execution layer, gates that apply constraints in real workflows | Store memory, define personas |

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

To maintain clear behavioral classification, LexSona uses **decision-style naming** for persona IDs. This convention describes *how* an agent approaches decisions rather than *what* it is.

**Format:** `{behavioral-focus}_{domain}`

| Persona ID | Behavioral Focus |
|------------|------------------|
| `quality-first_engineering` | Prioritizes thoroughness, testing, correctness |
| `momentum-first_product` | Prioritizes velocity, shipping, iteration |
| `risk-reducer_operations` | Prioritizes safety, asks when uncertain |

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

| ❌ Non-Goal | Why |
|-------------|-----|
| **Execution** | That's LexRunner |
| **Tool calling** | That's LexRunner |
| **Prompt assembly** | That's the consuming agent |
| **Gates/CI execution** | That's LexRunner |
| **Frame storage** | That's Lex |
| **Network requests during derivation** | Constraints must be derivable offline |

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
