# LexSona

**Behavioral constraint engine for AI agents.**

LexSona derives behavioral constraints from personas and rules. It returns constraints — it never executes work.

## Dependency Chain

```
Lex can run by itself.
LexSona needs Lex.
LexRunner needs both.
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  LexRunner (execution layer)                            │
│  - Applies constraints in real workflows                │
│  - Runs gates, executes tools                           │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  LexSona (constraint engine) ← YOU ARE HERE             │
│  - Derives constraints from personas + rules            │
│  - Returns constraints, never executes                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Lex (memory + policy + storage)                        │
│  - recordCorrection() / getRules() socket               │
│  - baseline.yaml constraints                            │
│  - lexsona_behavior_rules table                         │
└─────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install @smartergpt/lexsona
```

Requires `@smartergpt/lex` as a peer dependency.

## CLI Usage

LexSona uses noun-verb command syntax:

```bash
# Persona management
lexsona persona list                           # List available personas
lexsona persona activate quality-first_engineering
lexsona persona show quality-first_engineering

# Rules management
lexsona rules list                             # List active rules
lexsona rules learn <correction>               # Record a behavioral correction

# Constraints
lexsona constraints derive                     # Derive constraints from active persona + rules
lexsona constraints show                       # Show current constraint set
```

## API Surface

LexSona exposes a minimal public API:

```typescript
import { LexSona } from '@smartergpt/lexsona';

// Initialize with Lex connection
const sona = await LexSona.connect({ lexDb: '/path/to/lex.db' });

// Activate a persona (using behavioral ID)
await sona.activate('quality-first_engineering');

// Derive constraints for current context
const constraints = await sona.deriveConstraints({
  project: 'lex-pr-runner',
  task_type: 'implementation',
});

// Legacy input aliases (documentation contract):
// - taskType -> task_type
// - domain is a deprecated alias only when `project` is absent:
//   If `project` is missing and `domain` is present, the system copies `domain` into `project`,
//   emits a warning, and preserves the original under `extensions.<namespace>.domain`.

// Learn from correction
await sona.learn({
  correction: "Always run tests before committing",
  polarity: 1,
  context: { module_id: 'testing' }
});
```

## Persona Naming

To maintain clear behavioral classification, LexSona uses **decision-style naming** for persona IDs. This convention describes *how* an agent approaches decisions rather than *what* it is.

**Format:** `{behavioral-focus}_{domain}`

| Persona ID | Behavioral Focus |
|------------|------------------|
| `quality-first_engineering` | Prioritizes thoroughness, testing, correctness |
| `momentum-first_product` | Prioritizes velocity, shipping, iteration |
| `risk-reducer_operations` | Prioritizes safety, asks when uncertain |

**Approved behavioral patterns:** `quality-first`, `momentum-first`, `risk-reducer`, `scope-warden`, `test-first`, `minimal-diff`, `user-advocate`

## Non-Goals

LexSona explicitly does **NOT** do:

- ❌ Execution/orchestration (that's LexRunner)
- ❌ Tool calling (that's LexRunner)
- ❌ Prompt assembly (that's the consuming agent)
- ❌ Gates/CI execution (that's LexRunner)
- ❌ Frame storage (that's Lex)
- ❌ Network requests during derivation
- ❌ Universal export formats or runtime adapters
- ❌ Silent fallback to "safe" personas

## Offline-Safe Personas

LexSona distinguishes between connected and offline-safe personas:

| Persona Type | `requires_memory` | Behavior |
|--------------|-------------------|----------|
| **Connected** | `true` | Expects Lex memory connection; fails explicitly if unavailable |
| **Offline-safe** | `false` | Functions without Lex connection; enforces confidence ceiling |

Offline-safe personas must declare:
- `confidence_ceiling` — Maximum confidence for any derived constraint
- `no_memory_disclaimer` — Human-readable warning about limitations

**Hard selection rule:** If a persona requires memory and none is available, derivation fails loudly. No silent substitution.

## Core Principles

1. **Returns constraints, never executes** - Pure constraint derivation
2. **Deterministic** - Same inputs produce same constraint sets
3. **Auditable** - All rules and derivations are inspectable
4. **Scoped** - Rules are namespaced to prevent cross-domain pollution
5. **Degrades gracefully** - Offline-safe personas work when memory is unavailable
6. **Fails explicitly** - Connected personas fail loudly when disconnected (no silent fallback)

## Documentation

- [ADR-001: Architecture and Boundaries](docs/ADR-001-architecture.md)
- [AGENTS.md](AGENTS.md) - Agent operating principles

## License

Proprietary. See LICENSE file.
