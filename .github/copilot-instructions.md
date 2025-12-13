# GitHub Copilot Instructions for LexSona

## Architecture

LexSona is the **constraint engine layer** in the Lex ecosystem:

```
LexRunner (execution) → LexSona (constraints) → Lex (memory + policy)
```

**Key constraint:** LexSona **returns constraints**, it never executes or tool-calls.

## Naming Convention

To maintain clear behavioral classification, LexSona uses **decision-style naming** for persona IDs:

| Persona ID | Behavioral Focus |
|------------|------------------|
| `quality-first_engineering` | Prioritizes thoroughness, testing |
| `momentum-first_product` | Prioritizes velocity, shipping |

**Format:** `{behavioral-focus}_{domain}`

## CLI Syntax

LexSona uses **noun-verb** command syntax:

```bash
lexsona <noun> <verb> [options]
```

Examples:
- `lexsona persona activate quality-first_engineering`
- `lexsona rules learn "Always run tests"`
- `lexsona constraints derive --project lex`

> Note: `domain` is a deprecated alias for `project` and is only consulted when `project` is absent.

## Core Principles

1. **Deterministic outputs** - Same inputs → same constraint sets
2. **Auditable** - All rules and derivations are inspectable
3. **Scoped** - Rules are namespaced to prevent cross-domain pollution
4. **Never executes** - Returns constraints, never does work

## Directory Structure

```
src/
  cli/           # CLI entry point and commands
    commands/    # Noun command modules (persona, rules, constraints)
  core/          # LexSona runtime engine
  persona/       # Persona loading and management
  rules/         # Behavioral rule types and logic
  constraints/   # Constraint derivation engine
```

## Dependencies

- **Lex** is a peer dependency - LexSona uses Lex's storage APIs
- Commander for CLI
- Zod for schema validation

## Build & Test

```bash
npm ci && npm run build && npm test && npm run lint
```
