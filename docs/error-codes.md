# LexSona Error Codes

LexSona provides structured error codes that enable agents to implement retry logic and graceful degradation.

## Error Code Categories

### Persona Errors (`PERSONA_*`)
- `PERSONA_NOT_FOUND` - Persona with given ID not found in any search path
- `PERSONA_INVALID_ID` - Persona ID format is invalid
- `PERSONA_INVALID_MANIFEST` - Persona manifest has invalid structure
- `PERSONA_PARSE_FAILED` - Failed to parse persona YAML/frontmatter

### Rule Errors (`RULE_*`)
- `RULE_VALIDATION_FAILED` - Rule validation failed
- `RULE_SCOPE_INVALID` - Rule scope is invalid
- `RULE_TEXT_EMPTY` - Rule text is empty or whitespace-only
- `RULE_CATEGORY_INVALID` - Rule category is invalid

### Constraint Errors (`CONSTRAINT_*`)
- `CONSTRAINT_DERIVATION_FAILED` - Failed to derive constraints
- `CONSTRAINT_INVALID_CONTEXT` - Context provided for derivation is invalid

### Lex Connection Errors (`LEX_*`)
- `LEX_CONNECTION_FAILED` - Failed to connect to Lex database (retryable)
- `LEX_DB_NOT_FOUND` - Lex database file not found
- `LEX_DB_MISSING_TABLE` - Lex database missing required table
- `LEX_NOT_CONNECTED` - Operation requires Lex connection but not connected

### Validation Errors (`VALIDATION_*`)
- `VALIDATION_REQUIRED_FIELD` - Required parameter is missing
- `VALIDATION_INVALID_FORMAT` - Parameter has invalid format or type

### Internal Errors (`INTERNAL_*`)
- `INTERNAL_ERROR` - Unexpected internal error

## Usage for Agents

### Detecting Error Codes in MCP Responses

When calling LexSona MCP tools, error codes are embedded in error messages with the format:
```
[ERROR_CODE] Error message
Suggestions: suggestion1; suggestion2
```

Example:
```
[PERSONA_NOT_FOUND] Persona not found: test-persona
Suggestions: Check persona ID format (should be: {behavioral-focus}_{domain}); Run 'lexsona persona list' to see available personas
```

### Implementing Retry Logic

```javascript
try {
  // Call LexSona MCP tool
  await callTool("persona_activate", { persona: "my-persona" });
} catch (error) {
  const message = error.message || "";
  
  // Extract error code from message
  const match = message.match(/^\[([A-Z]+(?:_[A-Z]+)*)\]/);
  const errorCode = match ? match[1] : null;
  
  // Branch on error code
  if (errorCode === "PERSONA_NOT_FOUND") {
    // Fall back to default persona
    await callTool("persona_activate", { persona: "quality-first_engineering" });
  } else if (errorCode === "LEX_CONNECTION_FAILED") {
    // Retry with backoff (connection errors are retryable)
    await delay(1000);
    await callTool("persona_activate", { persona: "my-persona" });
  } else {
    // Non-retryable error
    throw error;
  }
}
```

### Using Error Metadata

When using LexSona as a library (not via MCP):

```typescript
import { LexSonaError, LexSonaErrorCode } from '@smartergpt/lexsona';

try {
  const persona = await loadPersona('my-persona');
} catch (error) {
  if (error instanceof LexSonaError) {
    console.log('Error code:', error.code);
    console.log('Is retryable:', error.isRetryable());
    console.log('Suggestions:', error.getSuggestions());
    
    // Branch on specific error codes
    switch (error.code) {
      case LexSonaErrorCode.PERSONA_NOT_FOUND:
        // Handle persona not found
        break;
      case LexSonaErrorCode.LEX_DB_NOT_FOUND:
        // Handle database not found
        break;
      default:
        throw error;
    }
  }
}
```

## Error Metadata

Each `LexSonaError` includes metadata:

- **`retryable`**: Boolean indicating if the operation can be retried
- **`suggestions`**: Array of human-readable suggestions to resolve the error
- **`context`**: Additional error-specific data (e.g., `personaId`, `searchPaths`, `dbPath`)

## Best Practices

1. **Always check for error codes** before falling back to default behavior
2. **Respect the retryable flag** - don't retry non-retryable errors
3. **Use suggestions** to provide helpful feedback to users
4. **Log error context** for debugging - it contains valuable diagnostic info
5. **Handle specific codes** - don't catch all errors the same way

## Migration from Generic Errors

Before:
```typescript
catch (error) {
  if (error.message.includes("not found")) {
    // Brittle string matching
  }
}
```

After:
```typescript
catch (error) {
  if (error instanceof LexSonaError && error.code === LexSonaErrorCode.PERSONA_NOT_FOUND) {
    // Machine-readable branching
  }
}
```
