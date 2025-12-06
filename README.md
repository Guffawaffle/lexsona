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
  domain: 'lex-pr-runner',
  taskType: 'implementation',
});

// Learn from correction
await sona.learn({
  correction: "Always run tests before committing",
  polarity: 1,
  context: { module_id: 'testing' }
});
```

## Persona Naming

LexSona uses **behavioral naming** for persona IDs:

| Persona ID | Behavior |
|------------|----------|
| `quality-first_engineering` | Prioritizes quality, thorough testing |
| `momentum-first_product` | Prioritizes velocity, ships fast |
| `risk-reducer_operations` | Conservative, asks when uncertain |

**Naming Rules:**
- Behavioral naming
- Behavioral classification
- Use behavioral/decision-style patterns

**Approved patterns:** `quality-first`, `momentum-first`, `risk-reducer`, `scope-warden`, `test-first`, `minimal-diff`, `user-advocate`

## Non-Goals

LexSona explicitly does **NOT** do:

- ❌ Execution/orchestration (that's LexRunner)
- ❌ Tool calling (that's LexRunner)
- ❌ Prompt assembly (that's the consuming agent)
- ❌ Gates/CI execution (that's LexRunner)
- ❌ Frame storage (that's Lex)
- ❌ Network requests during derivation

## Core Principles

1. **Returns constraints, never executes** - Pure constraint derivation
2. **Deterministic** - Same inputs produce same constraint sets
3. **Auditable** - All rules and derivations are inspectable
4. **Scoped** - Rules are namespaced to prevent cross-domain pollution
5. **Offline-capable** - Constraint derivation requires no network access

## Documentation

- [ADR-001: Architecture and Boundaries](docs/ADR-001-architecture.md)
- [AGENTS.md](AGENTS.md) - Agent operating principles

## License

Proprietary. See LICENSE file.
