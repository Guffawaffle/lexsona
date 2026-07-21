# Compact MCP output

LexSona's source-level MCP adapter can keep routine agent context small while retaining an explicit
path to explanation. Compact mode changes representation, not scope, authority, or constraint
selection.

## Availability

| Surface                  | Compact control                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| MCP `constraints_derive` | `format: "compact"` and optional `provenance: "compact"`                                           |
| MCP `rules_list`         | `format: "compact"`                                                                                |
| MCP `persona_activate`   | `format: "compact"`                                                                                |
| CLI `constraints derive` | `--provenance compact` compacts nested provenance only; the CLI has no whole-response compact flag |

The MCP adapter is currently a source-level integration surface; read [README.mcp.md](../README.mcp.md)
before embedding it.

## Constraint mapping

| Full field   | Compact field or behavior                                    |
| ------------ | ------------------------------------------------------------ |
| `rule_id`    | `id`                                                         |
| `text`       | omitted; retrieve a selected item with `constraints_explain` |
| `severity`   | `sev`: `m`, `s`, or `st`                                     |
| `confidence` | `conf`, rounded to two decimals                              |
| `category`   | `cat`                                                        |
| `source`     | `src` when present                                           |
| `provenance` | `prov`                                                       |

Compact provenance maps:

| Full field   | Compact field                                                  |
| ------------ | -------------------------------------------------------------- |
| `source`     | `src`: `p` for persona, `r` for learned rule, `b` for baseline |
| `rule_id`    | `rId`, present for a learned rule                              |
| `confidence` | `w`, rounded to two decimals                                   |

Other top-level mappings include `context` → `ctx`, `metadata` → `meta`, `ruleVersion` →
`ruleVer`, `confidenceThreshold` → `confThreshold`, `offlineMode` → `offline`, and
`confidenceCeiling` → `confCeiling`. Compact responses include `_compact: true`.

## Example

Input to `constraints_derive`:

```json
{
  "project": "lexsona",
  "module_id": "mcp/server",
  "task": "review",
  "format": "compact",
  "provenance": "compact"
}
```

Representative result shape:

```json
{
  "personaId": "quality-first_engineering",
  "constraints": [
    {
      "id": "rule_123",
      "sev": "m",
      "conf": 0.95,
      "cat": "validation",
      "prov": { "src": "r", "rId": "rule_123", "w": 0.95 }
    }
  ],
  "meta": {
    "confThreshold": 0.3,
    "offline": false
  },
  "_compact": true
}
```

## Agent workflow

1. Request a compact constraint set on the normal path.
2. Use IDs and severity to select only constraints relevant to the current decision.
3. Call `constraints_explain` for a specific selected ID when its text or provenance is needed.
4. Request full output only for debugging, review, or a decision that cannot be made from the compact
   result.

Never interpret compactness as permission to omit safety-relevant constraints. A host must preserve
the complete set internally when it attenuates what is shown to an agent.
