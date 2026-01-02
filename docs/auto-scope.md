# Auto-Scope Feature (LS-002)

This document describes the auto-scope feature for LexSona's `constraints derive` command.

## Overview

Auto-scope automatically infers the `module_id` scope from touched files instead of requiring explicit specification. It uses `lexmap.policy.json` to map file paths to module IDs.

## Usage

### Basic Usage

```bash
# Infer scope from git diff or LEX_TOUCHED_FILES
lexsona constraints derive --auto-scope

# Show what was inferred
lexsona constraints derive --auto-scope --verbose
```

### Example Output

```
$ lexsona constraints derive --auto-scope --verbose
Inferred scope: [cli, scope] from 3 files
  Source: git-diff

Constraint Set (v1)
═══════════════════
...
```

## Scope Inference Sources

The feature tries multiple sources in this priority order:

1. **Explicit `--module` flag** - Always takes precedence (overrides auto-scope)
2. **`LEX_TOUCHED_FILES` environment variable** - Colon-separated file paths
3. **Git diff** - Files modified in working tree (unstaged + staged)

### Using LEX_TOUCHED_FILES

Useful for IDE integration:

```bash
export LEX_TOUCHED_FILES="src/cli/commands/persona.ts:src/cli/index.ts"
lexsona constraints derive --auto-scope
# Infers scope: cli
```

### Using Git Diff

By default, checks both unstaged and staged files:

```bash
# Edit some files
echo "// change" >> src/scope/inferrer.ts

# Auto-scope will detect the change
lexsona constraints derive --auto-scope
# Infers scope: scope
```

## Lexmap Configuration

Create `canon/policy/lexmap.policy.json` in your project:

```json
{
  "modules": {
    "memory": {
      "paths": ["src/memory/**", "memory/**"],
      "constraints": ["no-side-effects", "pure-functions"]
    },
    "cli": {
      "paths": ["src/cli/**"],
      "constraints": ["user-facing", "helpful-errors"]
    },
    "constraints": {
      "paths": ["src/constraints/**"],
      "constraints": ["deterministic", "testable"]
    }
  }
}
```

### Path Matching

- Uses [micromatch](https://github.com/micromatch/micromatch) for glob pattern matching
- Supports `**` for recursive matching
- Supports `*` for single-level matching
- Multiple files can match the same module (deduplicated)

### Fallback Locations

Lexmap is searched in these locations (in order):

1. `canon/policy/lexmap.policy.json` (canonical location for Lex ecosystem)
2. `.smartergpt/lexmap.policy.json`
3. `lexmap.policy.json` (project root)

## Multiple Module Matches

When multiple files match different modules, the **first** module is used:

```bash
# Touched files: src/cli/index.ts, src/scope/inferrer.ts
# Modules: cli, scope
# Selected: cli (first in alphabetical order)
```

Future enhancement: Support multiple modules with `--modules` flag.

## Graceful Fallbacks

- If no lexmap found → proceeds without scope inference
- If no files match → proceeds without scope
- If git not available → tries other sources
- Errors in scope inference → warns but doesn't fail

## Examples

### Example 1: CLI Development

```bash
# Working on CLI commands
vim src/cli/commands/persona.ts

# Derive with auto-scope
lexsona constraints derive --auto-scope --verbose
# Output: Inferred scope: [cli] from 1 files
#         Source: git-diff
```

### Example 2: IDE Integration

```bash
# IDE sets LEX_TOUCHED_FILES based on open files
export LEX_TOUCHED_FILES="src/memory/store.ts:src/memory/cache.ts"

# Derive constraints for active context
lexsona constraints derive --auto-scope
# Infers: module_id=memory
```

### Example 3: Explicit Override

```bash
# Even with touched files, explicit flag wins
echo "// change" >> src/cli/index.ts
lexsona constraints derive --auto-scope --module memory
# Uses: module_id=memory (not cli)
```

## Testing

Run the unit tests:

```bash
npm test tests/unit/scope/
```

## Implementation Files

- `src/scope/inferrer.ts` - Main scope inference logic
- `src/scope/lexmap.ts` - Lexmap loading and path matching
- `src/cli/commands/constraints.ts` - CLI integration
- `tests/unit/scope/` - Unit tests
- `tests/integration/auto-scope.spec.ts` - Integration tests

## Future Enhancements

- Support multiple modules with `--modules cli,scope`
- Git commit range: `--auto-scope --since HEAD~3`
- IDE protocol for live file tracking
- Lexmap validation CLI command
