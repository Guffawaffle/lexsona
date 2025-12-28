# LexSona Scripts

## Label Management

### Automatic Sync

Labels are automatically synced when `.github/labels.yml` is updated on the `main` branch via the `sync-labels` GitHub Actions workflow.

### Manual Sync

To manually sync labels using the `gh` CLI:

```bash
./scripts/sync-labels.sh
```

This requires the `gh` CLI to be installed and authenticated.

### Label Definitions

See `.github/labels.yml` for the complete list of labels and their descriptions.

### Cross-Suite Labels

LexSona uses the following labels consistently with Lex and LexRunner:

- `ax` — agent experience / AX-first tooling
- `mcp` — Model Context Protocol surface changes
