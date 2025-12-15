# LexSona: Frequency-Weighted Behavioral Memory for Persistent AI Agent Identity

**Author:** Joseph M. Gustavson (ORCID: 0009-0001-0669-0749)

**AI Collaborators (analysis + drafting support):**

- OpenAI GPT-5.1 Thinking — system architecture, boundary definition, integration design
- Claude Sonnet 4.5 — Bayesian confidence modeling, procedural learning formalism
- Google Gemini 3 Pro — critical review, taxonomy pressure-testing, clarity edits

**Date:** December 6, 2025
**Version:** Public Canonical CptPlnt 1.1
**Status:** Implementation-aligned research specification

---

## Abstract

Large language models (LLMs) increasingly operate as long-lived agents embedded in complex workflows rather than one-off chatbots. In these settings, users repeatedly correct agent behavior: tool choices, coding style, safety boundaries, and communication norms. Today, these corrections are either forgotten after the session or approximated via broad, static instructions. At the other extreme, naive long-term memory systems hoard raw interaction logs and attempt to stuff them into prompts, leading to unbounded context growth, instability, and opaque failure modes.

This paper proposes **LexSona**, a lightweight behavioral memory layer that turns repeated user corrections into scoped, frequency-weighted behavioral rules. Instead of memorizing everything, LexSona tracks candidate rules, reinforces them when a user repeats a correction, decays them when they fall out of use, and returns only high-confidence rules as an agent's active constraint overlay. Rules are scoped by domain and module (with optional extensions to environment and agent-family), support explicit counterexamples, and expose an introspection interface so an agent can explain why it is enforcing a given behavior.

**This version reflects the current layered product boundary:**

- **Lex (OSS core)** provides episodic memory, policy contracts, and a **behavioral rules storage socket**.
- **LexSona (separate package/repo)** consumes Lex storage, performs persona/rule resolution, and **returns constraints**.
- **LexRunner** orchestrates tasks and **applies** constraints during execution.

LexSona does not orchestrate tools, assemble prompts, or execute actions. It is a constraint engine, not an execution engine.

**Keywords:** AI agents, behavioral memory, personalization, procedural knowledge, Bayesian modeling, policy-as-data

---

## 1. Introduction

### 1.1 The Problem: Ephemeral Agent Identity

Modern AI coding assistants and general-purpose LLM agents demonstrate notable capability, but they suffer from a persistent limitation: **behavioral amnesia**. Users must repeatedly correct the same agent mistakes across sessions:

- "Don't use shell one-liners for file edits in this project; use safe editing tools instead."
- "Be concise by default; expand only when asked."
- "Never commit secrets; scan diffs before pushing."

These corrections represent **procedural knowledge**: preferences about _how_ an agent should operate in a specific context. Current solutions fail along predictable axes:

1. **Session-local learning**: preferences vanish after the thread ends.
2. **Unscoped global memory**: workplace rules leak into personal projects.
3. **Opaque reinforcement**: users cannot inspect why a behavior persists.
4. **Model upgrade fragility**: behavior continuity breaks across model versions.

### 1.2 Episodic Memory Is Necessary But Insufficient

Episodic memory systems answer "what happened?" but do not reliably compress those events into stable procedural preferences. A robust agent stack requires an explicit bridge from correction events to enforceable, scoped behavioral rules.

### 1.3 Contribution

LexSona addresses this procedural gap by providing:

1. **Reinforcement-based rule emergence** rather than one-shot overrides.
2. **Strict scoping** to prevent cross-domain contamination.
3. **Deterministic conflict resolution** for consistent behavior.
4. **Bounded constraint snapshots** suitable for prompt-time injection by orchestrators.
5. **Introspectable provenance** connecting rules to correction history.

---

## 2. The Lex Ecosystem and Layer Boundaries

This paper adopts the following implementation-aligned dependency chain:

```
Lex can run by itself.
LexSona requires Lex.
LexRunner requires Lex + LexSona.
```

### 2.1 Lex (OSS Core)

Lex is the foundation layer responsible for:

- **Frames** (episodic memory)
- **Policy** (contracts and guardrails)
- **Behavioral rules storage socket** (schema + read/write primitives)

**Lex does not interpret behavioral rules.** It stores and retrieves them.

### 2.2 LexSona (Behavioral Layer)

LexSona is a separate package/repo that:

- Loads **baseline constraints** from Lex.
- Maps user corrections into behavioral rule updates stored in Lex.
- Resolves an **active constraint set** for a given context.
- Manages persona selection and overlay composition.

**LexSona does not orchestrate.** It returns data.

### 2.3 LexRunner (Orchestration Layer)

LexRunner is the execution system that:

- Plans tasks.
- Calls tools.
- Runs gates.
- Builds deterministic workflows.
- Queries LexSona for constraints and applies them.

This boundary prevents "Runner-lite drift" inside LexSona and avoids OSS/commercial entanglement inside Lex.

---

## 3. Problem Statement and Design Goals

### 3.1 Problem Statement

Given a stream of interactions containing correction events, learn a function:

```
f(context, min_confidence) → ConstraintSet
```

where `context` minimally includes:

- `domain` (project/repo namespace)
- `moduleId` (subsystem scope)
- `taskType` (optional, e.g., planning vs implementation)

The output is a deterministic constraint overlay that an orchestrator can apply.

### 3.2 Design Goals

1. **Reinforcement, not reflex**: repeated corrections raise confidence.
2. **Scope-first**: an unscoped rule is a last resort, not default.
3. **Bounded output**: typical active sets should remain small (e.g., 10-20 constraints).
4. **Determinism**: same inputs yield the same resolved set.
5. **Auditability**: every returned constraint is explainable.
6. **Safety monotonicity**: user-level rules can tighten behavior, never weaken platform safety.

---

## 4. The LexSona Behavioral Rule Model

### 4.1 Core Entities

#### Rule Context (implementation-aligned)

```typescript
interface RuleContext {
  domain?: string; // e.g., "lex", "lexsona", "lexrunner"
  moduleId?: string; // e.g., "cli/*", "memory/store/*"
  taskType?: string; // e.g., "planning", "implementation", "review"
  frameId?: string; // optional provenance link
}
```

#### Behavior Rule

```typescript
interface BehaviorRule {
  ruleId: string;
  correction: string;
  context: RuleContext;

  // Bayesian parameters
  alpha: number;
  beta: number;

  // Derived metrics
  confidence: number;
  effectiveConfidence: number;

  // Temporal signals
  firstSeen: string;
  lastObserved: string;
}
```

Lex stores these rules. LexSona interprets them.

### 4.2 Bayesian Confidence Model

LexSona models confidence as a **Beta distribution** with a skeptical prior:

- α₀ = 2
- β₀ = 5

Update rules:

- Reinforcement: α ← α + 1
- Counterexample: β ← β + 1

Posterior mean:

```
confidence = α / (α + β)
```

Recency weighting (applied by LexSona at read/resolve time):

```
effectiveConfidence = confidence × decay(t)
```

where `decay(t)` is an exponential function over time since last observation.

**Activation** uses an evidence floor and confidence threshold tuned per category (tooling vs security vs style). This prevents one-off rules from becoming permanent constraints.

### 4.3 Scoping and Precedence

When multiple applicable rules exist, LexSona resolves deterministically:

1. **Match filters** by domain/module/taskType.
2. **Prefer specificity**: module-scoped > domain-scoped > global.
3. **Prefer confidence** among equally specific candidates.
4. **Stable sort** to guarantee deterministic outputs.

### 4.4 Personas as Behavioral Bundles

Public-facing persona names should avoid job-role framing. The current recommended public exemplars are behavior-based:

- **Precision Mode**: cautious, test-first, strict diffs, high emphasis on correctness.
- **Momentum Mode**: scope-aware planning, completion bias, structured next actions.

Internally, these can still map to previously used labels, but the public API and docs should present behavior-based naming as the default.

---

## 5. Constraint Derivation Contract

LexSona returns a **ConstraintSet**; it does not execute:

```typescript
interface Constraint {
  id: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  source: "baseline" | "persona" | "learned";
  confidence?: number;
}

interface ConstraintSet {
  version: 1;
  persona: string | null;
  domain?: string;
  constraints: Constraint[];
  principles: { id: string; description: string }[];
  derivedAt: string;
  inputHash: string;
}
```

Merge priority (implementation-aligned):

- **baseline < persona < learned**
- severity grouping is stable and deterministic
- scoping filters are applied before ranking

---

## 6. Implementation Architecture

### 6.1 Storage Socket in Lex

Lex exposes:

- `recordCorrection(...)`
- `getRules(...)`
- a stable schema for behavioral rules

Lex remains agnostic to persona semantics.

### 6.2 LexSona Engine

LexSona provides:

- persona manifest loading
- activation state
- constraint derivation
- rule scoping and decay
- introspection APIs

### 6.3 Orchestrator Integration

LexRunner (or any external orchestrator) performs:

1. Query LexSona with context
2. Receive ConstraintSet
3. Apply constraints during planning/tool selection/prompt composition
4. Record corrections via LexSona (which delegates to Lex storage)

---

## 7. Evaluation (Preliminary)

Early internal pilot results (author-reported, n≈200 correction events) suggest:

- high utility in reducing repeated correction burden for common tooling and safety behaviors
- stable constraint snapshots that remain within a modest prompt budget under typical usage
- embedding-based matching is viable with conservative thresholds, with a confirmation band for ambiguous cases

These results should be treated as **preliminary** until released with a reproducible evaluation artifact and dataset description.

---

## 8. Limitations and Future Work

1. **Cold start**: default rule packs and persona templates can help, but must remain conservative.
2. **Classifier error**: false positives require explicit review flows.
3. **Scope explosion**: needs tooling for consolidation, dormancy, and cleanup.
4. **Cross-agent variance**: rules should be portable, but capability flags may be required for model-family differences.

---

## 9. Conclusion

LexSona is a frequency-weighted behavioral memory layer that converts repeated user corrections into scoped, introspectable, and deterministic constraint overlays. This paper formalizes LexSona’s confidence model, scoping logic, and integration contract while reflecting the current platform boundary:

- **Lex stores** behavioral rules.
- **LexSona resolves** personas and returns constraints.
- **LexRunner applies** constraints during orchestration.

This separation preserves OSS clarity, avoids architectural bloat, and enables a commercial-grade behavioral layer that remains independently useful even outside LexRunner.

---

## Acknowledgments

This document was authored by Joseph M. Gustavson with analysis and drafting assistance from multiple frontier models, including OpenAI GPT-5.1 Thinking, Claude Sonnet 4.5, and Google Gemini 3 Pro. The author assumes responsibility for all claims and interpretation.
