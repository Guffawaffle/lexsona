#!/bin/bash
# Script to manually sync labels using gh CLI
# Usage: ./scripts/sync-labels.sh
#
# This script reads label definitions from .github/labels.yml and creates/updates
# them in the repository using the gh CLI.

set -e

# Determine the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABELS_FILE="${SCRIPT_DIR}/../.github/labels.yml"

# Check if labels file exists
if [[ ! -f "$LABELS_FILE" ]]; then
  echo "❌ Error: Labels file not found at $LABELS_FILE"
  exit 1
fi

# Check if yq is available
if ! command -v yq &> /dev/null; then
  echo "❌ Error: 'yq' command not found. Please install yq to use this script."
  echo "   See: https://github.com/mikefarah/yq#install"
  exit 1
fi

# Check if gh is available
if ! command -v gh &> /dev/null; then
  echo "❌ Error: 'gh' command not found. Please install GitHub CLI."
  echo "   See: https://cli.github.com/"
  exit 1
fi

echo "📋 Reading labels from $LABELS_FILE..."

# Parse YAML and create labels
# Using tab delimiter (safer than pipe, unlikely to appear in label text)
yq eval '.[] | .name + "\t" + .description + "\t" + .color' "$LABELS_FILE" | while IFS=$'\t' read -r name description color; do
  echo "   Creating/updating label: $name"
  error_output=$(gh label create "$name" --description "$description" --color "$color" --force 2>&1) || {
    echo "   ⚠️  Warning: Failed to create/update label '$name': $error_output"
  }
done

echo ""
echo "✅ Labels synced successfully!"
echo ""
echo "Note: To apply labels to existing issues, use:"
echo "  gh issue edit <issue-number> --add-label <label-name>"
