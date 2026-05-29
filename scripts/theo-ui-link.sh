#!/usr/bin/env bash
# theo-ui-link.sh — opt-in workspace link cross-repo (ADR 0020).
#
# Swaps `pnpm-workspace.yaml` for the linked-ui variant, preserves the
# original as `.bak`, runs `pnpm install` so the workspace re-resolves
# with theo-ui linked.
#
# Guards:
#   1. Sibling `../theo-ui/` must exist.
#   2. EC-5 fix: `../theo-ui/dist/vite-plugin.js` must exist (UI must be built
#      — Vite's import of the subpath export would fail otherwise).
#   3. `.bak` must NOT exist (already linked → require unlink first).

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# Guard 1: sibling exists
if [ ! -d "../theo-ui" ]; then
  echo "Error: ../theo-ui sibling checkout not found."
  echo "Clone theo-ui to ../theo-ui first, then re-run."
  exit 1
fi

# Guard 2 (EC-5): dist/ buildado
if [ ! -f "../theo-ui/dist/vite-plugin.js" ]; then
  echo "Error: ../theo-ui/dist/ not built (missing vite-plugin.js)."
  echo "Run \`pnpm --dir ../theo-ui build\` first, then re-run \`pnpm theo-ui:link\`."
  exit 1
fi

# Guard 3: not already linked
if [ -f "$ROOT/pnpm-workspace.yaml.bak" ]; then
  echo "Already linked (pnpm-workspace.yaml.bak exists)."
  echo "Run \`pnpm theo-ui:unlink\` first to reset."
  exit 1
fi

# Swap + install
cp "$ROOT/pnpm-workspace.yaml" "$ROOT/pnpm-workspace.yaml.bak"
cp "$ROOT/pnpm-workspace.linked-ui.yaml" "$ROOT/pnpm-workspace.yaml"
pnpm install

echo ""
echo "✓ theo-ui is now LINKED to this workspace."
echo "  Edits in ../theo-ui/src/ reflect via HMR in your TheoKit dev server."
echo ""
echo "  Before committing: pnpm theo-ui:unlink"
echo "  (pre-commit hook will block commits while link is active — GATE 0.)"
