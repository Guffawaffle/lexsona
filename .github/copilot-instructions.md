# GitHub Copilot Instructions for LexSona

## Architecture

LexSona is the **constraint engine layer** in the Lex ecosystem:

```
LexRunner (execution) → LexSona (constraints) → Lex (memory + policy)
```

**Key constraint:** LexSona **returns constraints**, it never executes or tool-calls.

## Naming Policy

Persona IDs use **behavioral naming**, not behavioral patterns:

| ✅ Use | ❌ Avoid |
|--------|----------|
| `quality-first_engineering` | `quality-first_engineering` |
| `momentum-first_product` | `momentum-first_product` |

Format: `{behavior-focus}_{domain}`

## CLI Syntax

LexSona uses **noun-verb** command syntax:

```bash
lexsona <noun> <verb> [options]
```

Examples:
- `lexsona persona activate quality-first_engineering`
- `lexsona rules learn "Always run tests"`
- `lexsona constraints derive --domain lex`

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
