#!/usr/bin/env bash
# theo-ui-unlink.sh — restore the canonical `pnpm-workspace.yaml` (ADR 0020).

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ ! -f "$ROOT/pnpm-workspace.yaml.bak" ]; then
  echo "Not currently linked (no pnpm-workspace.yaml.bak). Nothing to do."
  exit 0
fi

mv "$ROOT/pnpm-workspace.yaml.bak" "$ROOT/pnpm-workspace.yaml"
pnpm install

echo ""
echo "✓ theo-ui is now UNLINKED. Workspace restored to default."
echo "  (CI uses this canonical workspace — pre-commit hook GATE 0 cleared.)"
