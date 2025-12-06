# AGENTS.md — LexSona

> **North Star**
> **Provide behavioral constraints for AI agents. Return constraints, never execute.**

This document orients all agents (human and automated) toward the same purpose.

---

## 0) Core Premise

1. **Constraint Engine, Not Executor.** LexSona derives constraint sets from rules and personas. It never executes tool calls or assembles prompts.
2. **Lex is the Foundation.** LexSona consumes Lex's storage APIs (`recordCorrection`, `getRules`, `baseline.yaml`) and never duplicates that functionality.
3. **Deterministic Outputs.** Same persona + rules + context → same constraint set. Always.
4. **Scoped by Design.** Rules are namespaced by domain/module to prevent cross-contamination.

---

## 1) Dependency Chain (Canonical)

```
Lex can run by itself.
LexSona needs Lex.
LexRunner needs both.
```

LexSona is a **peer** of Lex, not a fork. It imports Lex types and calls Lex APIs.

---

## 2) The Socket Model

Lex provides the **socket** — LexSona **plugs in**.

```
┌─────────────────────────────────────────┐
│  Lex (OSS core)                         │
│  ├─ recordCorrection()   ← socket       │
│  ├─ getRules()           ← socket       │
│  └─ baseline.yaml        ← constraints  │
└─────────────────────────────────────────┘
                    ↑
                  plugs into
                    │
┌─────────────────────────────────────────┐
│  LexSona (constraint engine)            │
│  ├─ connect()            ← init         │
│  ├─ activate()           ← persona      │
│  ├─ deriveConstraints()  ← core output  │
│  └─ learn()              ← feedback     │
└─────────────────────────────────────────┘
```

LexSona **never duplicates** storage or query logic.

---

## 3) Naming Convention

### Behavioral Classification

To maintain clear behavioral classification, LexSona uses **decision-style naming** for persona IDs. This convention describes *how* an agent approaches decisions rather than *what* it is.

### Format

```
{behavioral-focus}_{domain}
```

### Examples

| Persona ID | Behavioral Focus |
|------------|------------------|
| `quality-first_engineering` | Prioritizes thoroughness, testing, correctness |
| `momentum-first_product` | Prioritizes velocity, shipping, iteration |
| `risk-reducer_operations` | Prioritizes safety, asks when uncertain |

### Approved Behavioral Patterns

```
quality-first       momentum-first      risk-reducer
scope-warden        test-first          observability-first
minimal-diff        user-advocate       doc-first
```

---

## 4) Public API Contract

```typescript
// The minimal surface that matters
interface LexSona {
  connect(config): Promise<LexSona>;
  activate(personaId: string): Promise<void>;
  deriveConstraints(context): Promise<ConstraintSet>;
  learn(correction): Promise<void>;
}
```

Everything else is internal.

---

## 5) CLI Syntax

LexSona uses **noun-verb** command syntax:

```bash
lexsona <noun> <verb> [options]
```

| Noun | Verbs | Description |
|------|-------|-------------|
| persona | list, activate, show, deactivate | Manage personas |
| rules | list, learn, forget | Manage behavioral rules |
| constraints | derive, show, explain | View/derive constraints |

---

## 6) Definition of Done (v0.1.0)

- [ ] Can load rules from Lex store
- [ ] Can scope rules by domain/mode
- [ ] Can resolve a deterministic "active constraints set"
- [ ] Can record corrections and adjust weights/priority
- [ ] Has at least one boring-but-real persona pack for dogfooding

---

## 7) Non-Goals (Firm)

LexSona does **NOT** do:

| ❌ Non-Goal | Why |
|-------------|-----|
| Execution/orchestration | That's LexRunner |
| Tool calling | That's LexRunner |
| Prompt assembly | That's the consuming agent |
| Gates/CI execution | That's LexRunner |
| Frame storage | That's Lex |
| Network requests during derivation | Constraints must be derivable offline |

---

## 8) Coding Conventions

- **Language:** TypeScript only
- **Schemas:** Zod for validation
- **CLI:** Commander with noun-verb syntax
- **Tests:** Vitest
- **Style:** Follow Lex patterns

---

## 9) Invariants

- LexSona requires `@smartergpt/lex` as peer dependency
- Constraint derivation is pure (no side effects)
- All personas are loadable without network access
- Rule learning delegates to Lex's `recordCorrection` API
- Persona IDs use behavioral classification naming

---

## 10) Related Documents

- [ADR-001: Architecture and Boundaries](docs/ADR-001-architecture.md)
- Lex: `src/memory/store/lexsona-types.ts` (socket types)
- Lex: `canon/constraints/baseline.yaml` (baseline constraints)
