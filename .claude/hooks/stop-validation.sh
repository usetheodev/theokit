#!/bin/bash
# Stop hook: validates that modified packages have passing tests and features are wired.
# Any stdout output is fed back to Claude as context, preventing premature stop.
# If no issues are found, output is empty and Claude stops normally.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# 1. Collect ALL modified files (unstaged + staged + last commit)
# ---------------------------------------------------------------------------
UNSTAGED=$(git diff --name-only 2>/dev/null || true)
STAGED=$(git diff --cached --name-only 2>/dev/null || true)
LAST_COMMIT=$(git diff --name-only HEAD~1..HEAD 2>/dev/null || true)

ALL_FILES=$(echo -e "${UNSTAGED}\n${STAGED}\n${LAST_COMMIT}" | sort -u | grep -v '^$' || true)

if [ -z "$ALL_FILES" ]; then
  exit 0
fi

# Only care about source files
TS_CHANGED=$(echo "$ALL_FILES" | grep -E '\.(ts|tsx)$' || true)

if [ -z "$TS_CHANGED" ]; then
  exit 0
fi

ISSUES=()
TESTED_PKGS=()
WARNINGS=()

# ---------------------------------------------------------------------------
# 2. Extract affected packages
# ---------------------------------------------------------------------------
PKGS=""
if [ -n "$TS_CHANGED" ]; then
  PKGS=$(echo "$TS_CHANGED" | sed -n 's|^packages/\([^/]*\)/.*|\1|p' | sort -u || true)
fi

# ---------------------------------------------------------------------------
# 3. Run tests for each affected package (cap at 5)
# ---------------------------------------------------------------------------
PKG_COUNT=0
if [ -n "$PKGS" ]; then
  while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    PKG_COUNT=$((PKG_COUNT + 1))
    if [ "$PKG_COUNT" -gt 5 ]; then
      WARNINGS+=("More than 5 packages changed — tested only the first 5. Run 'npm test' manually.")
      break
    fi

    PKG_DIR="packages/$pkg"
    if [ ! -d "$PKG_DIR" ]; then
      continue
    fi

    TESTED_PKGS+=("$pkg")

    # Check if package has test script
    if [ -f "$PKG_DIR/package.json" ] && grep -q '"test"' "$PKG_DIR/package.json" 2>/dev/null; then
      TEST_OUTPUT=$(cd "$PKG_DIR" && npm test --if-present 2>&1 || true)

      if echo "$TEST_OUTPUT" | grep -qiE 'FAIL|failed|error|✗|×'; then
        FAILURES=$(echo "$TEST_OUTPUT" | grep -iE 'FAIL|failed|error|✗|×' | head -10)
        ISSUES+=("TESTS FAILING in $pkg:\n$FAILURES")
      fi
    fi
  done <<< "$PKGS"
fi

# ---------------------------------------------------------------------------
# 4. Check for orphaned exports (new exports referenced nowhere else)
# ---------------------------------------------------------------------------
if [ -n "$TS_CHANGED" ]; then
  NEW_EXPORTS=$(git diff HEAD -- '*.ts' '*.tsx' 2>/dev/null | \
    grep -E '^\+\s*export\s+(function|class|interface|type|const|enum)\s+' | \
    sed 's/^+\s*//' || true)

  STAGED_EXPORTS=$(git diff --cached -- '*.ts' '*.tsx' 2>/dev/null | \
    grep -E '^\+\s*export\s+(function|class|interface|type|const|enum)\s+' | \
    sed 's/^+\s*//' || true)

  ALL_EXPORTS=$(echo -e "${NEW_EXPORTS}\n${STAGED_EXPORTS}" | sort -u | grep -v '^$' || true)

  if [ -n "$ALL_EXPORTS" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue

      ITEM_NAME=$(echo "$line" | grep -oP '(function|class|interface|type|const|enum)\s+\K\w+' || true)
      [ -z "$ITEM_NAME" ] && continue

      # Skip common/trivial names
      if echo "$ITEM_NAME" | grep -qiE '^(default|Props|Options|Config|Context|Provider|Error|Type|Schema|test_|describe|it|expect)'; then
        continue
      fi

      if [ ${#ITEM_NAME} -le 3 ]; then
        continue
      fi

      # Count files referencing this item
      REF_COUNT=$(grep -rl "\b${ITEM_NAME}\b" packages/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l || echo "0")

      if [ "$REF_COUNT" -le 1 ]; then
        ITEM_TYPE=$(echo "$line" | grep -oP 'export\s+\K(function|class|interface|type|const|enum)' || echo "item")
        WARNINGS+=("POSSIBLY UNWIRED: export $ITEM_TYPE '$ITEM_NAME' found in only $REF_COUNT file(s). Is it integrated?")
      fi
    done <<< "$ALL_EXPORTS"
  fi
fi

# ---------------------------------------------------------------------------
# 5. TypeScript check on changed packages
# ---------------------------------------------------------------------------
if [ -n "$PKGS" ]; then
  while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    PKG_DIR="packages/$pkg"
    if [ -f "$PKG_DIR/tsconfig.json" ]; then
      TSC_OUTPUT=$(npx tsc --noEmit --project "$PKG_DIR/tsconfig.json" 2>&1 || true)
      if echo "$TSC_OUTPUT" | grep -qE 'error TS'; then
        TSC_ERRORS=$(echo "$TSC_OUTPUT" | grep -E 'error TS' | head -5)
        ISSUES+=("TYPE ERRORS in $pkg:\n$TSC_ERRORS")
      fi
    fi
  done <<< "$PKGS"
fi

# ---------------------------------------------------------------------------
# 6. Report
# ---------------------------------------------------------------------------
HAS_OUTPUT=false

if [ ${#ISSUES[@]} -gt 0 ]; then
  HAS_OUTPUT=true
  echo "============================================"
  echo "  INTEGRATION VALIDATION FAILED"
  echo "============================================"
  echo ""
  for issue in "${ISSUES[@]}"; do
    echo -e "  [BLOCK] $issue"
    echo ""
  done
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
  HAS_OUTPUT=true
  if [ ${#ISSUES[@]} -eq 0 ]; then
    echo "============================================"
    echo "  INTEGRATION VALIDATION — WARNINGS"
    echo "============================================"
    echo ""
  fi
  for warning in "${WARNINGS[@]}"; do
    echo -e "  [WARN] $warning"
    echo ""
  done
fi

if [ "$HAS_OUTPUT" = true ]; then
  echo "--------------------------------------------"
  echo "Packages tested: ${TESTED_PKGS[*]}"
  echo ""
  if [ ${#ISSUES[@]} -gt 0 ]; then
    echo "ACTION REQUIRED: Fix the [BLOCK] issues above before finishing."
  else
    echo "No blocking issues. Warnings are advisory — verify they are intentional."
  fi
fi

exit 0
