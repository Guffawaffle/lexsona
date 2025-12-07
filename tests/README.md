# LexSona Test Infrastructure

This directory contains the test infrastructure for LexSona, including fixtures, mocks, utilities, and test suites.

## Directory Structure

```
tests/
├── fixtures/           # Test data and sample files
│   ├── personas/       # Sample persona manifests
│   ├── rules/          # Sample behavior rules
│   └── corrections/    # Sample correction records
├── mocks/              # Mock implementations for dependencies
│   └── lex-client.ts   # Mock Lex storage client
├── utils/              # Test utilities and helpers
│   └── test-helpers.ts # Factory functions for test objects
├── unit/               # Unit tests
│   ├── core/           # Core LexSona tests
│   ├── rules/          # Rule engine tests
│   ├── constraints/    # Constraint derivation tests
│   ├── persona/        # Persona loader tests
│   ├── mocks/          # Mock implementation tests
│   └── utils/          # Test utilities tests
└── integration/        # Integration tests (future)
    └── cli/            # CLI integration tests (future)
```

## Fixtures

### Personas (`tests/fixtures/personas/`)

Sample persona manifests in Markdown format with YAML frontmatter:

- **`senior-dev.md`** - Quality-first engineering persona
  - ID: `quality-first_engineering`
  - Focus: Thoroughness, testing, correctness
  - Use for: Implementation, bug fixes, code review

- **`eager-pm.md`** - Momentum-first product persona
  - ID: `momentum-first_product`
  - Focus: Velocity, shipping, iteration
  - Use for: Planning, triage, workflow coordination

**Format:**
```markdown
---
id: quality-first_engineering
version: 1.1.0
behavior:
  primaryFocus: quality-first
  domain: engineering
  description: Prioritizes thoroughness, testing, correctness
duties:
  mustDo:
    - Run local-ci before any commit
  mustNotDo:
    - Skip type checking
triggers:
  phrases:
    - ok senior dev
ruleCategories:
  - tool_preference
  - testing
---

# Persona Name

Markdown body with additional documentation...
```

### Rules (`tests/fixtures/rules/`)

Sample behavior rules in YAML format:

- **`coding-style.yaml`** - Code quality and style rules
  - `use-editing-tools` - Tool preference rule
  - `run-tests-before-commit` - Testing requirement
  - `prefer-const` - Style guideline

- **`communication.yaml`** - Communication and documentation rules
  - `clear-commit-messages` - Git commit style
  - `document-decisions` - ADR requirement
  - `avoid-jargon` - Documentation clarity

**Format:**
```yaml
rules:
  - id: use-editing-tools
    category: tool_preference
    text: Use editing tools (replace_string_in_file), never sed
    severity: must
    scope:
      project: lex-pr-runner
```

### Corrections (`tests/fixtures/corrections/`)

Sample correction records for testing learning functionality:

- **`sample-corrections.json`** - Example correction records with various scopes and polarities

**Format:**
```json
{
  "corrections": [
    {
      "correction": "Use editing tools (replace_string_in_file), never sed",
      "polarity": 1,
      "context": {
        "module_id": "cli",
        "project": "lex-pr-runner"
      },
      "recordedAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

## Mocks

### Lex Client (`tests/mocks/lex-client.ts`)

Mock implementation of Lex storage APIs for isolated testing.

**Features:**
- In-memory rule storage
- Correction recording with tracking
- Configurable failure modes
- Scope-based rule filtering

**Usage:**
```typescript
import { createMockLexClient } from '../mocks/lex-client.js';

const client = createMockLexClient({
  rules: [testRule1, testRule2],
  recordSuccess: true,
  connectionFailed: false,
});

// Use in tests
const rules = await client.getRules({ module_id: 'cli' });
await client.recordCorrection({ correction: 'Test', polarity: 1, context: {} });
```

**API:**
- `isConnected()` - Check connection status
- `getRules(filter?)` - Get rules with optional filtering
- `recordCorrection(correction)` - Record a correction
- `getRecordedCorrections()` - Get all recorded corrections (test helper)
- `addRule(rule)` - Add a rule (test helper)
- `reset()` - Clear all state (test helper)
- `setConnectionFailed(failed)` - Simulate connection failure (test helper)

## Test Utilities

### Test Helpers (`tests/utils/test-helpers.ts`)

Factory functions to reduce boilerplate in tests:

**Functions:**
- `createTestRule(overrides?)` - Create a BehaviorRule with sensible defaults
- `createTestScope(overrides?)` - Create a RuleScope
- `createTestPersona(overrides?)` - Create a Persona
- `createTestContext(overrides?)` - Create a DeriveContext
- `createTestConstraint(overrides?)` - Create a Constraint
- `createTestConstraintSet(overrides?)` - Create a ConstraintSet
- `wait(ms)` - Wait for a specified duration
- `expectToThrow(fn, pattern)` - Assert that a function throws

**Usage:**
```typescript
import { createTestRule, createTestPersona } from '../utils/test-helpers.js';

// Create with defaults
const rule = createTestRule();

// Create with overrides
const customRule = createTestRule({
  rule_id: 'my-rule',
  text: 'My custom rule',
  severity: 'must',
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test tests/unit/core/lexsona.spec.ts
```

## Writing Tests

### Unit Tests

Place unit tests in `tests/unit/` organized by module:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockLexClient } from '../../mocks/lex-client.js';
import { createTestRule } from '../../utils/test-helpers.js';

describe('MyModule', () => {
  let client;

  beforeEach(() => {
    client = createMockLexClient();
  });

  it('does something', async () => {
    const rule = createTestRule({ rule_id: 'test' });
    client.addRule(rule);
    
    const result = await client.getRules();
    expect(result).toHaveLength(1);
  });
});
```

### Integration Tests

Place integration tests in `tests/integration/` organized by feature:

```typescript
// Future: tests/integration/cli/persona-activate.spec.ts
import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('CLI: persona activate', () => {
  it('activates a persona', async () => {
    const { stdout } = await execAsync('lexsona persona activate quality-first_engineering');
    expect(stdout).toContain('Activated persona: quality-first_engineering');
  });
});
```

## Configuration

### Vitest (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
    },
  },
});
```

## Coverage

Coverage is configured to track:
- All source files in `src/`
- Excludes type definitions and index files
- Reports in text and LCOV format

View coverage:
```bash
npm test -- --coverage
```

## Best Practices

1. **Use fixtures** - Load test data from fixtures instead of inline definitions
2. **Use mocks** - Isolate tests with mock implementations
3. **Use helpers** - Reduce boilerplate with test utility functions
4. **Test one thing** - Each test should verify a single behavior
5. **Clean state** - Use `beforeEach` to reset state between tests
6. **Descriptive names** - Test names should describe what they verify
7. **Arrange-Act-Assert** - Structure tests clearly

## Current Status

✅ **Complete:**
- Vitest configured with coverage
- Mock Lex client implemented and tested
- Test helpers implemented and tested
- Persona fixtures (2 sample personas)
- Rule fixtures (2 rule sets)
- Corrections fixture (6 sample corrections)
- 101 passing unit tests

🔮 **Future:**
- Integration tests for CLI commands
- E2E tests for full workflows
- Performance benchmarks
