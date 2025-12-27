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
| `text` | `txt` |
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

// Compact format
{
  "personaId": "quality-first_engineering",
  "constraints": [{
    "id": "rule_123",
    "txt": "Always validate inputs",
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
// Compact format
{
  "count": 2,
  "ruleVer": 42,
  "rules": [
    {"id": "r1", "txt": "Validate inputs", "sev": "m", "conf": 0.95, "cat": "validation"},
    {"id": "r2", "txt": "Write tests", "sev": "s", "conf": 0.85, "cat": "testing"}
  ],
  "_compact": true
}
```

## Compact Mode Indicator
All compact responses include `"_compact": true` to explicitly signal the format.

## Payload Size Reduction
Compact mode achieves:
- **20-50%** size reduction for typical responses
- **50%+** reduction for large constraint sets
- Preserves all IDs for follow-up lookups

## Supported Tools
- `persona_activate`
- `constraints_derive`
- `rules_list`
