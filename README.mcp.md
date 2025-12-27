# LexSona MCP Server

Model Context Protocol (MCP) adapter for LexSona, exposing behavioral constraint tools to AI agents.

## Quick Start

### Installation

```bash
npm install @smartergpt/lexsona
```

### Running the Server

The MCP server runs via stdio transport:

```bash
node mcp-server.mjs
```

Or with environment variables:

```bash
LEX_DB_PATH=/path/to/lex.db node mcp-server.mjs
```

### MCP Client Configuration

Add to your MCP client settings (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "lexsona": {
      "command": "node",
      "args": ["/path/to/lexsona/mcp-server.mjs"],
      "env": {
        "LEX_DB_PATH": "/path/to/lex.db"
      }
    }
  }
}
```

## Available Tools

### `lexsona_activate`

Activate a persona by ID.

**Input:**

- `persona` (required): Persona ID (e.g., `"quality-first_engineering"`)

**Output:**

```json
{
  "success": true,
  "persona": {
    "id": "quality-first_engineering",
    "version": "1.0.0",
    "behavior": "Prioritizes thoroughness, testing",
    "ruleCategories": ["general", "testing", "review"]
  }
}
```

### `lexsona_constraints`

Derive behavioral constraints for a context.

**Input:**

- `domain` (optional): Domain/project scope - maps to Lex's `project` field
- `module` (optional): Module scope - maps to Lex's `module_id` field
- `task` (optional): Task type (e.g., 'implementation', 'review')
- `persona` (optional): Override active persona

**Output:**

```json
{
  "personaId": "quality-first_engineering",
  "derivedAt": "2024-01-01T12:00:00.000Z",
  "context": {
    "project": "lex",
    "module_id": "mcp/server",
    "task_type": "implementation"
  },
  "constraints": [
    {
      "rule_id": "rule_001",
      "text": "Always validate inputs",
      "severity": "must",
      "confidence": 0.95,
      "category": "validation"
    }
  ],
  "principles": [],
  "metadata": {
    "rulesConsidered": 42,
    "rulesFiltered": 12,
    "confidenceThreshold": 0.3,
    "offlineMode": false
  }
}
```

### `lexsona_learn`

Record a behavioral correction.

**Input:**

- `correction` (required): The correction text
- `severity` (optional): `"must"`, `"should"`, or `"style"` (default: `"should"`)
- `category` (optional): Rule category (default: `"general"`)
- `domain` (optional): Domain/project scope - maps to Lex's `project` field
- `module` (optional): Module scope - maps to Lex's `module_id` field
- `polarity` (optional): `"reinforce"` or `"counter"` (default: `"reinforce"`)

**Scoping behavior:**

- Both `domain` and `module` are optional and independent
- When only `domain` is provided, the rule is scoped to the project/domain level
- When only `module` is provided, the rule is scoped to the module level
- When both are provided, the rule is scoped to both the domain and module (most specific)
- Neither field uses the other as a fallback

**Output:**

```json
{
  "success": true,
  "correction": "Always validate inputs",
  "severity": "must",
  "polarity": "reinforce"
}
```

### `lexsona_rules`

List learned behavioral rules.

**Input:**

- `domain` (optional): Filter by domain/project scope
- `minConfidence` (optional): Minimum confidence threshold

**Output:**

```json
{
  "count": 5,
  "rules": [
    {
      "rule_id": "rule_001",
      "text": "Always validate inputs",
      "severity": "must",
      "category": "validation",
      "confidence": 0.95
    }
  ]
}
```

### `lexsona_personas`

List available personas with capability matrix for agent selection (AX-003).

**Input:** None

**Output:**

```json
{
  "count": 2,
  "personas": [
    {
      "id": "quality-first_engineering",
      "behavior": "quality-first",
      "domain": "engineering",
      "optimizes": ["correctness", "testing", "maintainability"],
      "deprioritizes": ["velocity"],
      "triggerPhrases": ["senior dev", "quality first", "engineering mode"]
    },
    {
      "id": "momentum-first_product",
      "behavior": "momentum-first",
      "domain": "product",
      "optimizes": ["velocity", "iteration", "shipping"],
      "deprioritizes": ["perfection"],
      "triggerPhrases": ["eager pm", "momentum first", "product mode"]
    }
  ]
}
```

**Capability Matrix:** Each persona includes structured metadata to help agents autonomously select the right persona:

- `behavior`: Primary behavioral focus (e.g., "quality-first", "momentum-first")
- `domain`: Domain context (e.g., "engineering", "product")
- `optimizes`: Array of what this persona optimizes for
- `deprioritizes`: Array of what this persona deprioritizes
- `triggerPhrases`: Phrases that suggest this persona

### `introspect`

Get current LexSona state and capabilities for agent self-discovery.

**Input:** None

**Output:**

```json
{
  "version": "0.3.0",
  "state": {
    "activePersona": "quality-first_engineering",
    "ruleCount": 12,
    "lexConnected": true,
    "lexDbPath": "/path/to/lex.db"
  },
  "personas": ["quality-first_engineering", "momentum-first_product"],
  "capabilities": {
    "caching": false,
    "lexIntegration": true
  },
  "errorCodes": [
    "PERSONA_NOT_FOUND",
    "PERSONA_INVALID_ID",
    "LEX_CONNECTION_FAILED",
    "LEX_DB_NOT_FOUND",
    "VALIDATION_REQUIRED_FIELD",
    "..."
  ]
}
```

**Use cases:**
- Agent can discover which persona is currently active
- Check if Lex connection is healthy
- Get list of available personas to switch between
- Access machine-readable error codes for error handling

## Architecture

The MCP server is a thin adapter layer:

```
MCP Client → MCP Server → LexSona Core → Lex Storage
```

- **`server.ts`**: MCP protocol handling and routing
- **`tools.ts`**: Tool definitions and input schemas
- **`handlers.ts`**: Thin adapters delegating to LexSona core APIs

All business logic lives in LexSona core - the MCP layer is just protocol translation.

## Environment Variables

- `LEX_DB_PATH`: Path to Lex database (optional, uses default if not set)

## Disconnected Mode

LexSona can operate without a Lex database connection:

- `lexsona_activate` and `lexsona_personas` work offline
- `lexsona_constraints` returns empty constraint sets
- `lexsona_rules` returns empty arrays
- `lexsona_learn` throws an error

Use offline-safe personas (`requires_memory: false`) when disconnected.

## Development

### Running Tests

```bash
npm test
```

Integration tests verify:

- Tool registration
- Handler functionality
- JSON output format
- Mocked Lex interactions

### Building

```bash
npm run build
```

Outputs to `dist/mcp/`.

## Related

- [LexSona Documentation](./README.md)
- [Lex Memory System](https://github.com/Guffawaffle/lex)
- [Model Context Protocol](https://modelcontextprotocol.io)
