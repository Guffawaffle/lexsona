# LexSona

**Behavioral memory and persona engine for AI agents.**

LexSona provides the persona layer for AI agents, building on Lex's memory and policy foundation.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  LexRunner (orchestration)                              │
│  - Consumes both Lex + LexSona                          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  LexSona (persona engine) ← YOU ARE HERE                │
│  - quality-first, momentum-first personas                        │
│  - Consumes Lex behavioral socket                       │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Lex (memory + policy + constraints)                    │
│  - recordCorrection() / getRules() socket               │
│  - baseline.yaml constraints                            │
│  - lexsona_behavior_rules table                         │
└─────────────────────────────────────────────────────────┘
```

## Dependency Chain

**Lex can run by itself.**
**LexSona needs Lex.**
**LexRunner needs both.**

## Installation

```bash
npm install @smartergpt/lexsona
```

Requires `@smartergpt/lex` as a peer dependency.

## CLI Usage

LexSona uses noun-verb command syntax:

```bash
# Persona management
lexsona persona list              # List available personas
lexsona persona activate <name>   # Activate a persona
lexsona persona show <name>       # Show persona details

# Rules management  
lexsona rules list                # List active rules
lexsona rules learn <correction>  # Record a behavioral correction
lexsona rules apply               # Apply rules to derive constraints

# Constraints
lexsona constraints derive        # Derive constraints from active persona + rules
lexsona constraints show          # Show current constraint set
```

## API Surface

LexSona exposes a minimal public API:

```typescript
import { LexSona } from '@smartergpt/lexsona';

// Initialize with Lex connection
const sona = await LexSona.connect({ lexDb: '/path/to/lex.db' });

// Activate a persona
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

## Core Principles

1. **Never orchestrates** - Returns constraints, never executes tool calls
2. **Deterministic** - Same inputs produce same constraint sets
3. **Auditable** - All rules and derivations are inspectable
4. **Scoped** - Rules are namespaced to prevent cross-domain pollution

## License

MIT
