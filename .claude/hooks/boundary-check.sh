#!/bin/bash
# PreToolUse hook for Edit/Write: checks architectural boundaries
# Validates that files being edited respect package boundaries
# Exit 0 = allow, Exit 2 = block

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty')

# Extract package name from path
PKG=""
if echo "$FILE_PATH" | grep -q "packages/"; then
  PKG=$(echo "$FILE_PATH" | sed -n 's|.*packages/\([^/]*\)/.*|\1|p')
fi

# Guard: agents/ directory must NOT exist in MVP
if echo "$FILE_PATH" | grep -qE '^(.*/)?(packages/agents|src/agents)/'; then
  echo '{"decision":"block","reason":"SCOPE VIOLATION: agents/ is OUT of MVP scope. The Theo framework must be excellent as a web framework first. agents/ belongs to Phase 2 only."}' >&2
  exit 2
fi

# Guard: app/ files should not import from server/ internals directly
if echo "$FILE_PATH" | grep -qE 'packages/theo-frontend/|packages/theo-app/|app/.*\.(ts|tsx)$'; then
  if echo "$CONTENT" | grep -qE "from\s+['\"].*server/(routes|actions|middleware|context)"; then
    echo '{"decision":"block","reason":"BOUNDARY VIOLATION: Frontend code must NOT import server internals directly. Use the typed client or server actions."}' >&2
    exit 2
  fi
fi

# Guard: core packages should not depend on CLI/DX packages
if echo "$FILE_PATH" | grep -qE 'packages/theo-(core|router|server)/'; then
  if echo "$CONTENT" | grep -qE "from\s+['\"]@theo/(cli|create-theo|dx)"; then
    echo '{"decision":"block","reason":"BOUNDARY VIOLATION: Core packages must NOT depend on CLI/DX packages. Dependency flows downward only."}' >&2
    exit 2
  fi
fi

exit 0
