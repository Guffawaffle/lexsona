# Constraint Packs

Constraint packs are collections of behavioral constraints defined in persona YAML files. They allow personas to specify context-specific rules that are automatically activated based on file scope.

## Overview

Constraint packs complement the existing constraint derivation system:

- **Persona duties** → Always active constraints (mustDo, mustNotDo, shouldDo)
- **Learned rules** → Rules stored in Lex memory, filtered by category and scope
- **Constraint packs** → Persona-defined constraints with file pattern matching

## Structure

Constraint packs are defined in the persona YAML under the `constraints` section:

```yaml
constraints:
  pack-name:
    - id: constraint-id
      statement: "Description of the constraint"
      severity: error | warning | info
      appliesTo: ["file/pattern/**/*.ts"]
```

### Fields

- **id**: Unique identifier for the constraint within the pack
- **statement**: Human-readable constraint description
- **severity**: Priority level
  - `error` → maps to `must` severity (high priority)
  - `warning` → maps to `should` severity (medium priority)
  - `info` → maps to `style` severity (low priority)
- **appliesTo**: Array of glob patterns for file matching

## Example: Agent Integration Pack

The `agent-integration` pack in `quality-first_engineering` provides quality guardrails for AI coding agents:

```yaml
constraints:
  agent-integration:
    - id: interface-completeness
      statement: "When adding properties to an interface, check all implementing types and test fixtures"
      severity: error
      appliesTo: ["**/*.ts"]

    - id: fixture-schema-sync
      statement: "Test fixtures must include all required and commonly-used optional fields"
      severity: warning
      appliesTo: ["tests/**/*.spec.ts", "tests/**/*.test.ts"]

    - id: export-new-types
      statement: "New public types must be exported from the nearest index.ts"
      severity: error
      appliesTo: ["src/**/*.ts"]

    - id: mock-data-realism
      statement: "Mock data should use realistic values that match production patterns"
      severity: warning
      appliesTo: ["tests/**/*"]
```

## Usage

### API Usage

```typescript
import { deriveConstraints } from "@smartergpt/lexsona";
import { loadPersona } from "@smartergpt/lexsona/persona";

const persona = loadPersona("quality-first_engineering");

// Derive constraints for specific files
const constraints = deriveConstraints(persona, [], [], {
  files: ["src/core/types.ts", "tests/unit/example.spec.ts"],
});

// Filter to see only constraint pack rules
const packConstraints = constraints.constraints.filter((c) =>
  c.category.startsWith("constraint-pack:")
);
```

### CLI Usage (Example)

```bash
lexsona constraints derive \
  --persona quality-first_engineering \
  --scope tests/

# Output:
# Active Constraints:
#   📋 agent-integration pack (4 rules)
#     • interface-completeness (error)
#     • fixture-schema-sync (warning)
#     • export-new-types (error)
#     • mock-data-realism (warning)
```

## File Scope Filtering

When `files` are provided in the derivation context, constraints are filtered by their `appliesTo` patterns:

```typescript
// Only constraints matching test files will be included
const result = deriveConstraints(persona, [], [], {
  files: ["tests/unit/example.spec.ts"],
});
// Returns: interface-completeness, fixture-schema-sync, mock-data-realism

// Only constraints matching src files will be included
const result = deriveConstraints(persona, [], [], {
  files: ["src/core/types.ts"],
});
// Returns: interface-completeness, export-new-types

// No file filter = all constraints included
const result = deriveConstraints(persona, [], [], {});
// Returns: all 4 constraints
```

## Pattern Matching

Constraint packs use [micromatch](https://github.com/micromatch/micromatch) for glob pattern matching:

- `**/*.ts` - All TypeScript files in any directory
- `src/**/*.ts` - TypeScript files only in src/ directory
- `tests/**/*.spec.ts` - Spec files in tests/ directory
- `*.ts` - TypeScript files only in root (no subdirectories)

## Constraint Priority

Constraints are prioritized in this order:

1. **Persona duties** (mustDo, mustNotDo, shouldDo) - Highest priority
2. **Constraint packs** - Medium priority
3. **Learned rules** - Filtered by confidence and category

All persona-defined constraints (duties + packs) have confidence = 1.0.

## Design Principles

1. **Explicit over implicit** - Constraints are clearly defined in persona YAML
2. **Scoped activation** - Only relevant constraints are active based on file patterns
3. **Auditable** - All constraints have clear provenance and can be traced
4. **Optional** - Personas can function without constraint packs

## Creating New Constraint Packs

To add a new constraint pack:

1. Add the pack definition to the persona YAML under `constraints:`
2. Define each constraint with id, statement, severity, and appliesTo patterns
3. Ensure patterns use valid glob syntax
4. Test with `deriveConstraints()` to verify filtering works correctly

Example:

```yaml
constraints:
  security-first:
    - id: sanitize-inputs
      statement: "All user inputs must be sanitized before use"
      severity: error
      appliesTo: ["src/api/**/*.ts", "src/routes/**/*.ts"]

    - id: avoid-eval
      statement: "Never use eval() or Function() constructor"
      severity: error
      appliesTo: ["**/*.ts", "**/*.js"]
```

## Testing

Constraint pack functionality includes comprehensive tests:

- Schema validation for constraint pack structure
- File pattern matching and filtering
- Severity mapping (error → must, warning → should, info → style)
- Integration with existing constraint derivation

See `tests/unit/constraints/agent-integration.spec.ts` for examples.
