# Compact Format Mode (AX-009)

## Overview
LexSona MCP tools support a `format` parameter with two values:
- `full` (default): Complete field names and all metadata
- `compact`: Abbreviated field names for reduced payload size

## Field Mappings

### Constraints
| Full Format | Compact Format |
|------------|----------------|
| `rule_id` | `id` |
| `text` | *omitted* (use `constraints_explain` for details) |
| `severity` | `sev` (`m`/`s`/`st` for must/should/style) |
| `confidence` | `conf` (rounded to 2 decimals) |
| `category` | `cat` |
| `source` | `src` (optional) |

### Principles
| Full Format | Compact Format |
|------------|----------------|
| `description` | `desc` |

### Metadata
| Full Format | Compact Format |
|------------|----------------|
| `ruleVersion` | `ruleVer` |
| `context` | `ctx` |
| `metadata` | `meta` |
| `confidenceThreshold` | `confThreshold` |
| `offlineMode` | `offline` |
| `confidenceCeiling` | `confCeiling` |

### Persona (activate)
| Full Format | Compact Format |
|------------|----------------|
| `version` | `ver` |
| `behavior` | `bhv` (primary focus only) |
| `ruleCategories` | `cats` |

## Usage Examples

### constraints_derive
```json
// Full format (default)
{
  "personaId": "quality-first_engineering",
  "constraints": [{
    "rule_id": "rule_123",
    "text": "Always validate inputs",
    "severity": "must",
    "confidence": 0.95,
    "category": "validation"
  }],
  "metadata": {
    "confidenceThreshold": 0.3,
    "offlineMode": false
  }
}

// Compact format (text omitted - use constraints_explain to get details)
{
  "personaId": "quality-first_engineering",
  "constraints": [{
    "id": "rule_123",
    "sev": "m",
    "conf": 0.95,
    "cat": "validation"
  }],
  "meta": {
    "confThreshold": 0.3,
    "offline": false
  },
  "_compact": true
}
```

### rules_list
```json
// Compact format (text omitted - IDs only for efficient lookup)
{
  "count": 2,
  "ruleVer": 42,
  "rules": [
    {"id": "r1", "sev": "m", "conf": 0.95, "cat": "validation"},
    {"id": "r2", "sev": "s", "conf": 0.85, "cat": "testing"}
  ],
  "_compact": true
}
```

## Key Features
- **Text omitted in compact mode**: Use `constraints_explain` tool to get full constraint details
- **IDs preserved**: All IDs maintained for follow-up lookups
- **Compact indicator**: `_compact: true` flag signals the format  
- **Confidence rounding**: Rounded to 2 decimals to reduce size
- **Severity codes**: Abbreviated to 1-2 characters (m/s/st)

## Workflow Pattern
1. **Get list**: Use `constraints_derive` or `rules_list` with `format=compact` for efficient overview
2. **Get details**: Use `constraints_explain` with specific constraint IDs to retrieve full text and reasoning
3. **Stay in context**: Compact responses use less tokens, preserving context window for agents

## Payload Size Reduction
Compact mode achieves:
- **50-70%** size reduction for typical constraint lists
- **60%+** reduction for large rule sets (100+ rules)
- Preserves all IDs for follow-up lookups

## Supported Tools
- `persona_activate`
- `constraints_derive`
- `rules_list`
