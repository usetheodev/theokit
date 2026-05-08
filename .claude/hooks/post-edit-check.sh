#!/bin/bash
# PostToolUse hook for Edit/Write: quick validation after file changes
# Runs TypeScript type-check on the affected package for fast feedback
# Exit 0 = ok (stdout is additional context for Claude)

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check TypeScript files
if ! echo "$FILE_PATH" | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

# Extract package name from path
PKG=""
if echo "$FILE_PATH" | grep -q "packages/"; then
  PKG=$(echo "$FILE_PATH" | sed -n 's|.*packages/\([^/]*\)/.*|\1|p')
fi

# Quick type-check if we can identify the package
if [ -n "$PKG" ]; then
  PKG_DIR="packages/$PKG"
  if [ -f "$PKG_DIR/tsconfig.json" ]; then
    if ! npx tsc --noEmit --project "$PKG_DIR/tsconfig.json" 2>&1 | tail -5; then
      echo "TypeScript check failed for $PKG — fix type errors before continuing."
    fi
  fi
fi

exit 0
