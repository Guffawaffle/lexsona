# LexSona Test Infrastructure

This directory contains the test infrastructure for LexSona, including fixtures, mocks, and utilities to simplify writing tests.

## Directory Structure

```
tests/
├── fixtures/          # Test data files
│   ├── personas/     # Persona YAML fixtures
│   └── rules/        # Rule YAML fixtures
├── mocks/            # Mock implementations
│   └── lex-client.ts # Mock Lex database client
├── utils/            # Test utilities
│   └── test-helpers.ts # Helper functions for creating test data
├── unit/             # Unit tests
├── shared/           # Shared integration tests
│   └── lexsona/     # LexSona-specific shared tests
└── README.md         # This file
```

## Test Fixtures

### Personas

Persona fixtures are YAML files that represent different behavioral modes for testing:

- **`senior-dev.yaml`** - Quality-first engineering persona
  - Focus: Thoroughness, testing, correctness
  - Use for: Testing quality-oriented constraints
- **`eager-pm.yaml`** - Momentum-first product persona
  - Focus: Velocity, shipping, iteration
  - Use for: Testing completion-oriented constraints

**Usage:**

```typescript
import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { PersonaManifestSchema } from "../../src/persona/types.js";

const personaPath = join(__dirname, "..", "fixtures", "personas", "senior-dev.yaml");
const personaData = parseYaml(readFileSync(personaPath, "utf-8"));
const persona = PersonaManifestSchema.parse(personaData);
```

### Rules

Rule fixtures contain behavioral rules for testing constraint derivation:

- **`coding-style.yaml`** - Tool preferences, testing, code quality rules
- **`communication.yaml`** - Communication style and documentation rules

**Usage:**

```typescript
import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

const rulesPath = join(__dirname, "..", "fixtures", "rules", "coding-style.yaml");
const rulesData = parseYaml(readFileSync(rulesPath, "utf-8"));
const rules = rulesData.rules; // Array of BehaviorRule objects
```

## Test Mocks

### MockLexClient

A lightweight mock implementation of the Lex database client for isolated testing.

**Features:**

- In-memory rule storage
- Correction recording with tracking
- Configurable failure modes for error testing

**Usage:**

```typescript
import { createMockLexClient, MockLexClient } from "../mocks/lex-client.js";
import { createTestRule } from "../utils/test-helpers.js";

// Create a mock client with pre-loaded rules
const mockClient = createMockLexClient({
  rules: [
    createTestRule({
      rule_id: "test-1",
      category: "testing",
      text: "Always write tests",
    }),
  ],
  recordSuccess: true, // recordCorrection will succeed
  connectionFailed: false, // Connection available
});

// Use in tests
const rules = await mockClient.getRules();
const result = await mockClient.recordCorrection({
  correction: "Add missing test",
  polarity: -1,
  context: {},
});

// Verify corrections were recorded
const corrections = mockClient.getRecordedCorrections();
expect(corrections).toHaveLength(1);
```

**Error Testing:**

```typescript
// Simulate connection failure
const failingClient = createMockLexClient({ connectionFailed: true });
await expect(failingClient.getRules()).rejects.toThrow("connection failed");

// Simulate recording failure
const recordFailClient = createMockLexClient({ recordSuccess: false });
const result = await recordFailClient.recordCorrection({
  /* ... */
});
expect(result.success).toBe(false);
```

## Test Utilities

### Database Isolation

**IMPORTANT**: Tests should NEVER hit the real database at `~/.smartergpt/lex/memory.db`.

The `db-fixtures.ts` module provides utilities for creating isolated test databases:

#### `createIsolatedTestDb(options?)`

Create a temporary test database with proper schema:

```typescript
import { createIsolatedTestDb } from "../utils/db-fixtures.js";

let testDb: ReturnType<typeof createIsolatedTestDb>;

beforeAll(() => {
  // Create isolated database
  testDb = createIsolatedTestDb({
    createRulesTable: true,        // Create lexsona_behavior_rules table
    createPersonasTable: false,     // Don't create personas table
    createSchemaVersionTable: false, // Don't create schema_version table
  });

  // Point environment to test database
  process.env.LEX_DB_PATH = testDb.path;
});

afterAll(() => {
  // Clean up test database
  testDb.cleanup();
});
```

**Options:**
- `createRulesTable` - Create `lexsona_behavior_rules` table (default: `true`)
- `createPersonasTable` - Create `personas` table (default: `false`)
- `createSchemaVersionTable` - Create `schema_version` table (default: `false`)
- `schemaVersion` - Schema version to set (default: `10`)
- `closeAfterSetup` - Close DB after creating schema (default: `false`)

#### `withTestEnv(dbPath, fn)`

Run a function with a temporary test database path:

```typescript
import { createIsolatedTestDb, withTestEnv } from "../utils/db-fixtures.js";

const testDb = createIsolatedTestDb();

await withTestEnv(testDb.path, async () => {
  // LEX_DB_PATH is set to testDb.path here
  const sona = await LexSona.connect();
  // ... test code ...
});
// LEX_DB_PATH is restored to original value here

testDb.cleanup();
```

#### `withTestEnvSync(dbPath, fn)`

Synchronous version of `withTestEnv`:

```typescript
import { createIsolatedTestDb, withTestEnvSync } from "../utils/db-fixtures.js";

const testDb = createIsolatedTestDb();

withTestEnvSync(testDb.path, () => {
  // LEX_DB_PATH is set to testDb.path here
  const dbPath = process.env.LEX_DB_PATH;
  // ... test code ...
});
// LEX_DB_PATH is restored to original value here

testDb.cleanup();
```

### Helper Functions

The `test-helpers.ts` module provides factory functions to create test data with sensible defaults:

#### `createTestRule(overrides?)`

Create a BehaviorRule for testing:

```typescript
import { createTestRule } from "../utils/test-helpers.js";

const rule = createTestRule({
  rule_id: "custom-rule",
  category: "testing",
  text: "Test rule description",
  severity: "must",
  scope: { module_id: "core" },
});
```

#### `createTestPersona(overrides?)`

Create a Persona for testing:

```typescript
import { createTestPersona } from "../utils/test-helpers.js";

const persona = createTestPersona({
  id: "test-persona",
  behavior: {
    primaryFocus: "quality-first",
    domain: "testing",
    description: "Test persona",
  },
  ruleCategories: ["testing", "code_quality"],
});
```

#### `createTestScope(overrides?)`

Create a RuleScope for testing:

```typescript
import { createTestScope } from "../utils/test-helpers.js";

const scope = createTestScope({
  module_id: "core",
  task_type: "implementation",
  context_tags: ["urgent", "security"],
});
```

#### `createTestContext(overrides?)`

Create a DeriveContext for constraint derivation tests:

```typescript
import { createTestContext } from "../utils/test-helpers.js";

const context = createTestContext({
  domain: "engineering",
  module_id: "core",
  taskType: "implementation",
});
```

#### `createTestConstraint(overrides?)`

Create a Constraint for testing:

```typescript
import { createTestConstraint } from "../utils/test-helpers.js";

const constraint = createTestConstraint({
  rule_id: "test-rule",
  text: "Test constraint",
  severity: "should",
  confidence: 0.85,
});
```

#### `createTestConstraintSet(overrides?)`

Create a ConstraintSet for testing:

```typescript
import { createTestConstraintSet } from "../utils/test-helpers.js";

const constraintSet = createTestConstraintSet({
  personaId: "quality-first_engineering",
  constraints: [
    createTestConstraint({ text: "Write tests" }),
    createTestConstraint({ text: "Run linter" }),
  ],
});
```

#### Utility Functions

**`wait(ms: number)`** - Async delay for timing tests:

```typescript
import { wait } from "../utils/test-helpers.js";

await wait(1000); // Wait 1 second
```

**`expectToThrow(fn, messagePattern)`** - Assert that async function throws:

```typescript
import { expectToThrow } from "../utils/test-helpers.js";

await expectToThrow(async () => {
  throw new Error("Invalid input");
}, /Invalid input/);
```

## Example Tests

### Using Fixtures and Mocks

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { deriveConstraints } from "../../src/constraints/derive.js";
import { createMockLexClient } from "../mocks/lex-client.js";
import { PersonaManifestSchema } from "../../src/persona/types.js";

describe("deriveConstraints with fixtures", () => {
  it("derives constraints using fixture persona and rules", () => {
    // Load persona fixture
    const personaPath = join(__dirname, "..", "fixtures", "personas", "senior-dev.yaml");
    const personaData = parseYaml(readFileSync(personaPath, "utf-8"));
    const persona = PersonaManifestSchema.parse(personaData);

    // Load rule fixtures
    const rulesPath = join(__dirname, "..", "fixtures", "rules", "coding-style.yaml");
    const rulesData = parseYaml(readFileSync(rulesPath, "utf-8"));

    // Mock Lex client with fixture rules
    const mockClient = createMockLexClient({ rules: rulesData.rules });

    // Derive constraints
    const result = deriveConstraints(persona, rulesData.rules, [], { domain: "engineering" });

    expect(result.personaId).toBe("quality-first_engineering");
    expect(result.constraints.length).toBeGreaterThan(0);
  });
});
```

### Using Test Helpers

```typescript
import { describe, it, expect } from "vitest";
import { deriveConstraints } from "../../src/constraints/derive.js";
import { createTestPersona, createTestRule, createTestContext } from "../utils/test-helpers.js";

describe("deriveConstraints with helpers", () => {
  it("filters rules by category", () => {
    const persona = createTestPersona({
      ruleCategories: ["testing"],
    });

    const rules = [
      createTestRule({ category: "testing", text: "Write tests" }),
      createTestRule({ category: "security", text: "Check auth" }),
    ];

    const context = createTestContext({ domain: "engineering" });
    const result = deriveConstraints(persona, rules, [], context);

    // Only testing category should be included
    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0].category).toBe("testing");
  });
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/unit/core/deriveConstraints.spec.ts

# Run tests with coverage
npm test -- --coverage
```

## Writing New Tests

### Best Practices

1. **Always use isolated test databases** - NEVER let tests hit the real database at `~/.smartergpt/lex/memory.db`. Use `createIsolatedTestDb()` for all integration tests.
2. **Use fixtures for integration tests** - When testing how components work together, use the YAML fixtures
3. **Use test helpers for unit tests** - For focused unit tests, use helper functions for quick setup
4. **Use mocks to isolate** - Use MockLexClient to avoid database dependencies
5. **Keep tests deterministic** - Avoid randomness; use fixed dates/values
6. **Test edge cases** - Empty arrays, null values, boundary conditions
7. **Follow existing patterns** - Look at `tests/unit/constraints/derive.spec.ts` for examples
8. **Clean up after tests** - Always call `testDb.cleanup()` in `afterAll()` or `afterEach()`

### Test Organization

- **Unit tests** (`tests/unit/`) - Test individual functions/classes in isolation
- **Shared tests** (`tests/shared/`) - Test cross-cutting concerns like fixtures loading
- **Integration tests** - Could go in `tests/integration/` (not yet created)

### Adding New Fixtures

To add a new fixture:

1. Create the YAML file in the appropriate subdirectory
2. Add a test in `tests/shared/lexsona/fixtures.test.ts` to verify it loads
3. Document it in this README

## CI/CD

Tests run automatically on:

- Pull request creation/updates
- Pushes to main branch

The test suite must pass before merging.

## Troubleshooting

**Problem:** Tests can't find fixtures  
**Solution:** Check that paths use `join(__dirname, "..", "fixtures", ...)`

**Problem:** TypeScript errors in test files  
**Solution:** Ensure you're importing from compiled `.js` files: `from "../../src/foo.js"`

**Problem:** Mock not behaving as expected  
**Solution:** Check if you need to set `hasLexConnection: true` in options

**Problem:** Vitest not found  
**Solution:** Run `npm ci` to install dependencies

**Problem:** Test fails with "Database not found" or connects to real database  
**Solution:** Ensure you're using `createIsolatedTestDb()` and setting `process.env.LEX_DB_PATH = testDb.path` in `beforeAll()` or `beforeEach()`

**Problem:** Tests are flaky or fail based on real DB state  
**Solution:** Your test is likely hitting the real database. Add database isolation using `createIsolatedTestDb()`

## Contributing

When adding new test infrastructure:

1. Keep it minimal and focused
2. Add examples to this README
3. Write tests for your test utilities (meta!)
4. Update the directory structure diagram if needed
