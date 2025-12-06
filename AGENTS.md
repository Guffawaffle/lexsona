# AGENTS.md — LexSona

> **North Star**
> **Provide behavioral memory and persona constraints for AI agents.**
> **Return constraints, never orchestrate.**

This document orients all agents (human and automated) toward the same purpose.

---

## 0) Core Premise

1. **Constraint Engine, Not Orchestrator.** LexSona derives constraint sets from rules and personas. It never executes tool calls or assembles prompts.

2. **Lex is the Foundation.** LexSona consumes Lex's storage APIs (`recordCorrection`, `getRules`, `baseline.yaml`) and never duplicates that functionality.

3. **Deterministic Outputs.** Same persona + rules + context → same constraint set. Always.

4. **Scoped by Design.** Rules are namespaced by domain/module to prevent cross-contamination.

---

## 1) Dependency Chain

```
Lex can run by itself.
LexSona needs Lex.
LexRunner needs both.
```

LexSona is a **peer** of Lex, not a fork. It imports Lex types and calls Lex APIs.

---

## 2) Public API Contract

```typescript
// The minimal surface that matters
interface LexSona {
  connect(config): Promise<LexSona>;
  activate(persona: string): Promise<void>;
  deriveConstraints(context): Promise<ConstraintSet>;
  learn(correction): Promise<void>;
}
```

Everything else is internal.

---

## 3) CLI Syntax

LexSona uses **noun-verb** command syntax:

```bash
lexsona <noun> <verb> [options]
```

| Noun | Verbs | Description |
|------|-------|-------------|
| persona | list, activate, show, deactivate | Manage personas |
| rules | list, learn, apply, forget | Manage behavioral rules |
| constraints | derive, show, explain | View/derive constraints |

---

## 4) Definition of Done (v0.1.0)

- [ ] Can load rules from Lex store
- [ ] Can scope rules by domain/mode
- [ ] Can resolve a deterministic "active constraints set"
- [ ] Can record corrections and adjust weights/priority
- [ ] Has at least one boring-but-real persona pack for dogfooding

---

## 5) Coding Conventions

- **Language:** TypeScript only
- **Schemas:** Zod for validation
- **CLI:** Commander with noun-verb syntax
- **Tests:** Vitest
- **Style:** Follow Lex patterns

---

## 6) What LexSona Does NOT Do

- ❌ Execute tool calls
- ❌ Assemble prompts
- ❌ Store frames (that's Lex)
- ❌ Run gates (that's LexRunner)
- ❌ Make network requests during constraint derivation

---

## 7) Invariants

- LexSona requires `@smartergpt/lex` as peer dependency
- Constraint derivation is pure (no side effects)
- All personas are loadable without network access
- Rule learning delegates to Lex's `recordCorrection` API
