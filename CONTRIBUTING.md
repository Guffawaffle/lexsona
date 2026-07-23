# Contributing to LexSona

## Overview

LexSona is the constraint engine layer in the Lex ecosystem. Before contributing, please review:

- [AGENTS.md](./AGENTS.md) - Architecture and operating principles
- [README.md](./README.md) - Project overview and usage

## Development Setup

```bash
# Install dependencies
npm ci

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Type check
npm run typecheck
```

## Pull Request Workflow

### Single PR (Simple Changes)

For small, independent changes:

1. Create a feature branch from `main`
2. Make changes, ensure all gates pass locally
3. Open PR against `main`
4. Request review and merge when approved

### Umbrella Branch Pattern (Concurrent PRs)

When multiple PRs are in flight and need coordinated integration:

1. **Create umbrella branch:**

   ```bash
   git fetch origin
   git checkout -b integration/umbrella-YYYYMMDD origin/main
   ```

2. **Merge feature PRs into umbrella:**

   ```bash
   git merge --no-ff origin/feature-branch-1 -m "Merge PR #X: Description"
   git merge --no-ff origin/feature-branch-2 -m "Merge PR #Y: Description"
   # Resolve conflicts as needed
   ```

3. **Run all gates on umbrella:**

   ```bash
   npm run ci
   ```

4. **Push umbrella and create PR to main:**

   ```bash
   git push origin integration/umbrella-YYYYMMDD
   gh pr create --base main --title "Umbrella: Merge PRs #X, #Y, #Z"
   ```

5. **After umbrella merges:** Individual PRs auto-close when their commits reach main.

### Conflict Resolution

When merging concurrent PRs creates conflicts:

| File Type                          | Strategy                                              | Example                     |
| ---------------------------------- | ----------------------------------------------------- | --------------------------- |
| **Documentation (\*.md)**          | Take latest version, manually merge content if needed | tests/README.md             |
| **Test Fixtures (_.yaml, _.json)** | Merge both versions                                   | fixtures/personas/\*.yaml   |
| **Source Code (\*.ts)**            | Manual resolution required                            | src/\*_/_.ts                |
| **Config Files**                   | Take feature branch (`--theirs`)                      | package.json, tsconfig.json |

**When uncertain:** Stop and ask. Document the conflict in the PR description.

## Issue Labels

LexSona uses standardized labels across the Lex suite for consistent issue hygiene:

### Cross-Suite Labels

- **`ax`** - Agent experience / AX-first tooling (consistent with Lex and LexRunner)
- **`mcp`** - Model Context Protocol surface changes (consistent with Lex and LexRunner)

### General Labels

- **`bug`** - Correctness issues (e.g., scoping bugs, incorrect behavior)
- **`dx`** - Developer experience improvements
- **`enhancement`** - New feature or request
- **`documentation`** - Improvements or additions to documentation
- **`good first issue`** - Good for newcomers
- **`help wanted`** - Extra attention is needed

Label definitions are maintained in `.github/labels.yml` and automatically synced to the repository. See `scripts/README.md` for manual sync instructions.

## Commit Style

Use imperative mood with optional prefixes:

```
feat: Add persona loading from YAML
fix: Handle missing database path gracefully
test: Add integration tests for MCP server
docs: Update README with usage examples
refactor: Extract constraint derivation logic
```

## Testing

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- tests/unit/core/lexsona.spec.ts

# Full local gate (lint, typecheck, tests, and build)
npm run ci
```

`npm test`, `npm run ci`, and `npm run ci:full` remove `dist`, build the CLI from the current
checkout, and then run Vitest. They are therefore safe to run in a fresh worktree and cannot satisfy
CLI integration tests with stale build output.

CLI subprocess tests must set a test-owned working directory, home/config directories, and explicit
database path. Positive cases must create a temporary fixture; missing-database cases must use a
temporary nonexistent path. Never allow a test to discover, open, query, or mutate a project-local
or user-global Lex database from the host machine.

### Test Fixtures

Test fixtures are located in `tests/fixtures/`:

- `personas/` - Sample persona manifests (YAML)
- `rules/` - Sample behavior rules (YAML)
- `corrections/` - Sample correction records (JSON)

See [tests/README.md](./tests/README.md) for detailed fixture documentation.

## Code Style

- **Language:** TypeScript only
- **Schemas:** Zod for validation
- **CLI:** Commander with noun-verb syntax
- **Tests:** Vitest

## Architecture Principles

From [AGENTS.md](./AGENTS.md):

1. **Constraint Engine, Not Executor** - LexSona returns constraints, never executes
2. **Lex owns behavioral storage** - LexSona consumes Lex's storage socket
3. **Deterministic Selection** - Same validated inputs select the same constraints and input hash
4. **Scoped by Design** - Rules remain bounded by their declared context
5. **Guidance Is Not Authority** - A constraint never grants permission to act

## Questions?

- Check [AGENTS.md](./AGENTS.md) for architecture questions
- Check [README.mcp.md](./README.mcp.md) for the source-level MCP adapter boundary
- Open an issue for bugs or feature requests
