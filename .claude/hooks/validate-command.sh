#!/bin/bash
# PreToolUse hook for Bash: validates dangerous commands
# Exit 0 = allow, Exit 2 = block (stderr shown to Claude)

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block destructive git operations
if echo "$COMMAND" | grep -qE 'git\s+(checkout|revert)\s'; then
  echo "BLOCKED: git checkout and git revert are forbidden. Use git stash or create a new branch." >&2
  exit 2
fi

if echo "$COMMAND" | grep -qE 'git\s+push\s+(-f\b|--force($|\s))'; then
  echo "BLOCKED: force push is forbidden. Use --force-with-lease if absolutely necessary." >&2
  exit 2
fi

if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  echo "BLOCKED: git reset --hard is forbidden. Use git stash instead." >&2
  exit 2
fi

# Block working directly on main
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
if [ "$BRANCH" = "main" ]; then
  if echo "$COMMAND" | grep -qE 'git\s+commit'; then
    echo "BLOCKED: Never commit directly to main. Create a feature branch first." >&2
    exit 2
  fi
fi

# Block rm -rf on system paths
if echo "$COMMAND" | grep -qE 'rm\s+-rf\s+(/\s*$|/\s|/\*|~\s*$|~\s|\$HOME|/home(\s|/|$)|/etc(\s|/|$)|/usr(\s|/|$)|/var(\s|/|$)|/bin(\s|/|$)|/lib(\s|/|$)|/opt(\s|/|$)|/boot(\s|/|$)|/root(\s|/|$))'; then
  echo "BLOCKED: rm -rf on a system path. Use a tmpdir under /tmp/ instead." >&2
  exit 2
fi

exit 0
