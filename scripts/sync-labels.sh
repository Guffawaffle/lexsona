#!/bin/bash
# Script to manually sync labels using gh CLI
# Usage: ./scripts/sync-labels.sh

set -e

REPO="Guffawaffle/lexsona"

echo "Syncing labels for $REPO..."

# Create or update labels based on .github/labels.yml
gh label create "ax" --description "Agent experience / AX-first tooling" --color "0E8A16" --force || true
gh label create "mcp" --description "Model Context Protocol surface changes" --color "1D76DB" --force || true
gh label create "bug" --description "Correctness issues (e.g., scoping bugs, incorrect behavior)" --color "D73A4A" --force || true
gh label create "dx" --description "Developer experience improvements" --color "0075CA" --force || true
gh label create "enhancement" --description "New feature or request" --color "A2EEEF" --force || true
gh label create "documentation" --description "Improvements or additions to documentation" --color "0075CA" --force || true
gh label create "good first issue" --description "Good for newcomers" --color "7057FF" --force || true
gh label create "help wanted" --description "Extra attention is needed" --color "008672" --force || true

echo "✅ Labels synced successfully!"
echo ""
echo "To update existing AX/MCP issues (#54-#63), you can run:"
echo "  gh issue edit <issue-number> --add-label ax"
echo "  gh issue edit <issue-number> --add-label mcp"
