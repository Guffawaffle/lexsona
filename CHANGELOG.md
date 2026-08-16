# Changelog

All notable changes to LexSona will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Source public, CLI, MCP, and constraint-snapshot version metadata from the package manifest.

## [1.1.0] - 2026-02-08

### Changed

- **SQLite dependency floor bump** - `better-sqlite3-multiple-ciphers` from `^12.5.0` to `^12.6.2`
  - Aligns all ecosystem repos (lex, lexsona, lexrunner) on the same SQLite version
  - Includes upstream bug fixes and performance improvements

---

## [1.0.0] - 2025-12-28

### ⚠️ BREAKING CHANGES

#### Deprecated MCP Tool Aliases Removed

The deprecated `lexsona_*` MCP tool name aliases have been removed. Only canonical names are now supported.

| Removed Alias (deprecated)  | Use Instead (canonical) |
| --------------------------- | ----------------------- |
| `lexsona_persona_activate`  | `persona_activate`      |
| `lexsona_constraint_derive` | `constraints_derive`    |
| `lexsona_rule_learn`        | `rules_learn`           |
| `lexsona_rule_list`         | `rules_list`            |
| `lexsona_persona_list`      | `persona_list`          |

If you were using the deprecated aliases, update your MCP client configuration to use the canonical names.

### Added

- **Baseline Constraints Loading** - Load baseline constraints from bundled `baseline.yaml`:
  - Principles and constraints loaded from YAML (no longer hardcoded)
  - Baseline constraints marked with `source: "baseline"` in provenance
  - Constraints automatically included in `deriveConstraints()` output
  - Priority: persona constraints > learned rules > baseline constraints
  - Works in offline mode (bundled with package)

- **CLI `--json` Mode Improvements**:
  - `constraints explain` now respects `--json` flag with structured output
  - `db status` returns structured JSON with connection details
  - `rules list` includes `hint` and `threshold` fields in empty response

- **AX-010: Lightweight Provenance Mode** - Added compact provenance format for token-constrained agents:
  - New `provenance` parameter for `constraints_derive` (CLI and MCP): `full` (default) or `compact`
  - Compact provenance uses single-char source codes: `p` (persona), `r` (rule/learned), `b` (baseline)
  - Abbreviated field names: `src` (source), `w` (weight/confidence), `rId` (rule ID when applicable)
  - Confidence rounded to 2 decimal places
  - Achieves 25-35% additional payload reduction while maintaining explainability
  - Independent from format mode - can mix `format=full` with `provenance=compact`
  - Full provenance still available via `constraints_explain` for debugging

- **AX-003: Persona Capability Matrix** - Enhanced `persona_list` MCP response with structured metadata for agent-driven persona selection:
  - `behavior`: Primary behavioral focus (e.g., "quality-first", "momentum-first")
  - `domain`: Domain context (e.g., "engineering", "product")
  - `optimizes`: Array of what the persona optimizes for
  - `deprioritizes`: Array of what the persona deprioritizes
  - `triggerPhrases`: Phrases that suggest this persona
- Added `PersonaCapability` type and schema for capability matrix validation
- Added explicit `capability` field to persona manifests (optional, derived if not present)

### Removed

- All deprecated `lexsona_*` MCP tool aliases

### Changed

- Updated `persona_list` MCP handler to return capability matrix instead of raw behavior object

## [0.3.0] - 2025-12-16

### ⚠️ BREAKING CHANGE: MCP Tool Names

**VS Code automatically adds `mcp_{servername}_` prefix to all tool names.** Our previous naming included redundant prefixes, causing tools to appear as `mcp_lexsona_lexsona_persona_activate` instead of `mcp_lexsona_persona_activate`.

This release removes the namespace prefix from tool definitions to match the GitHub MCP pattern.

#### Migration Guide

| v0.3.x Tool Name            | v0.3.x Tool Name     | VS Code Display                  |
| --------------------------- | -------------------- | -------------------------------- |
| `lexsona_persona_activate`  | `persona_activate`   | `mcp_lexsona_persona_activate`   |
| `lexsona_constraint_derive` | `constraints_derive` | `mcp_lexsona_constraints_derive` |
| `lexsona_rule_learn`        | `rules_learn`        | `mcp_lexsona_rules_learn`        |
| `lexsona_rule_list`         | `rules_list`         | `mcp_lexsona_rules_list`         |
| `lexsona_persona_list`      | `persona_list`       | `mcp_lexsona_persona_list`       |

**Backwards Compatibility:** Old `lexsona_*` names are preserved as deprecated aliases and will continue to work. They will be removed in v1.0.0.

### Changed

- MCP tool names no longer include namespace prefix (GitHub MCP pattern)

### Fixed

- Tools now display correctly in VS Code as `mcp_lexsona_{action}` instead of `mcp_lexsona_lexsona_{action}`

---

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
