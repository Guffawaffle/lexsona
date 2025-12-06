# Changelog

All notable changes to LexSona will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-06

### Added

- **Core Engine** (`LexSona` class)
  - `connect()` - Connect to Lex database
  - `activate()` - Activate a persona
  - `deriveConstraints()` - Derive constraints from persona + rules
  - `learn()` - Record behavioral corrections
  - `getRules()` - Retrieve rules with filtering

- **Constraint Derivation**
  - Pure, deterministic constraint derivation
  - Scope matching (module_id, task_type, environment)
  - Severity-based sorting (must > should > style)
  - Confidence thresholds

- **Persona System**
  - Behavioral classification naming (`{focus}_{domain}`)
  - Bundled personas: `quality-first_engineering`, `momentum-first_product`
  - Trigger phrase matching
  - YAML frontmatter + markdown body format

- **Rule Scoping**
  - Module, task type, environment filtering
  - Glob pattern matching
  - Scope specificity calculation

- **CLI** (noun-verb syntax)
  - `lexsona persona list|activate|show|deactivate`
  - `lexsona rules list|learn|forget`
  - `lexsona constraints derive|show|explain`

- **MCP Server Adapter**
  - `lexsona_activate` - Activate persona
  - `lexsona_constraints` - Derive constraints
  - `lexsona_learn` - Record corrections
  - `lexsona_rules` - List rules
  - `lexsona_personas` - List personas

### Non-Goals for 0.1.x

These are explicitly **out of scope** and will not be added in patch releases:

- Execution or orchestration (that's LexRunner)
- Prompt assembly (that's the consuming agent)
- Network requests during constraint derivation
- Baseline principle loading (planned for 0.2.0)
- Web UI or dashboard

### Dependencies

- Requires `@smartergpt/lex@^2.0.0` as peer dependency

## [Unreleased]

## [0.2.0] - 2025-12-06

### Added

- **Offline-Safe Persona Support** (Version Contract v0.2)
  - `requires_memory` field on persona manifests (required)
  - `offline_safe` configuration for disconnected operation
    - `confidence_ceiling`: Maximum confidence for any derived constraint
    - `no_memory_disclaimer`: Human-readable warning for agents
  - `PersonaRequiresMemoryError` thrown when persona requires memory but none available
  - Hard selection rule: fail loud, no silent fallback

- **Confidence Ceiling Enforcement**
  - Offline-safe personas cap all derived constraint confidence
  - Metadata includes `offlineMode` and `confidenceCeiling` flags

- **DeriveConfig.hasLexConnection**
  - Caller must declare connection state (default: false = conservative)

### Changed

- Bundled personas updated to v1.1.0 with `requires_memory: false`
- `ConstraintSet.metadata` now includes `offlineMode` and `confidenceCeiling`

### Non-Goals (Hard Banned by Contract)

Per Version Contract v0.2, these are **explicitly prohibited**:

- Universal export format for "any runtime"
- Runtime auto-detection (Copilot/Cursor/etc.)
- Silent fallback to safe personas
- Prompt assembly or disclaimer injection
- New persona/mode runtime features in Lex

### Planned for 0.3.0

- Baseline principle loading from `canon/constraints/baseline.yaml`
- Frame integration for auditability
- Persona inheritance/composition
