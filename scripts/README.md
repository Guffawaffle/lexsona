# LexSona Scripts

## Label Management

### Automatic Sync

Labels are automatically synced when `.github/labels.yml` is updated on the `main` branch via the `sync-labels` GitHub Actions workflow.

### Manual Sync

To manually sync labels using the `gh` CLI:

```bash
./scripts/sync-labels.sh
```

**Requirements:**

- `gh` CLI (GitHub CLI) - [Installation guide](https://cli.github.com/)
- `yq` - YAML processor - [Installation guide](https://github.com/mikefarah/yq#install)

The script reads label definitions directly from `.github/labels.yml`, ensuring consistency between the configuration file and the manual sync process.

### Label Definitions

See `.github/labels.yml` for the complete list of labels and their descriptions.

### Cross-Suite Labels

LexSona uses the following labels consistently with Lex and LexRunner:

- `ax` — agent experience / AX-first tooling
- `mcp` — Model Context Protocol surface changes
