#!/usr/bin/env bash
# T7.2 — Bundle budget assertion (0.3.0 CI gate).
#
# Builds fixtures/template-default with `theokit build`, then measures the
# gzipped size of the largest emitted `index-*.js` chunk and fails the run
# if it exceeds the budget. Locks in the 193.90 KB result from Phase 4 of
# the nextjs-maturity plan so a future PR cannot silently regress.
#
# Exit codes:
#   0 — bundle size at or below budget
#   1 — bundle size exceeds budget
#   2 — build artifact not found (build failed, or path moved)
#
# Configurable via env:
#   BUNDLE_BUDGET_KB   threshold in KB (default 350)
#   BUNDLE_FIXTURE     fixture directory under repo root (default fixtures/template-default)
#   BUNDLE_SKIP_BUILD  when set to "1", skip the build step (assume artifacts present)
#
# EC-10: when multiple `index-*.js` chunks exist (rare — usually one), we
# report the LARGEST gzipped size. Summing would penalize naturally-split
# bundles unfairly; the largest chunk is the one that blocks render.
#
# EC-10b: gzipping uses Node's `zlib` via a one-line `node -e` invocation
# so the script works identically on Linux, macOS, and Windows runners.
# We do NOT shell out to the `gzip` command (not universally available on
# CI images).

set -euo pipefail

BUDGET_KB="${BUNDLE_BUDGET_KB:-350}"
FIXTURE="${BUNDLE_FIXTURE:-fixtures/template-default}"
SKIP_BUILD="${BUNDLE_SKIP_BUILD:-0}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -d "$FIXTURE" ]; then
  echo "[bundle-budget] error: fixture '$FIXTURE' does not exist" >&2
  exit 2
fi

if [ "$SKIP_BUILD" != "1" ]; then
  (cd "$FIXTURE" && pnpm exec theokit build >/dev/null 2>&1) || {
    echo "[bundle-budget] error: theokit build failed in $FIXTURE" >&2
    exit 2
  }
fi

ASSET_DIR="$FIXTURE/.theo/client/assets"
if [ ! -d "$ASSET_DIR" ]; then
  echo "[bundle-budget] error: build output not found at $ASSET_DIR" >&2
  exit 2
fi

# Collect every index-*.js chunk. There is usually exactly one; multiple
# only appear when Vite splits the entry on developer-defined boundaries.
MAX_GZ_BYTES=0
LARGEST_FILE=""
while IFS= read -r -d '' chunk; do
  GZ_BYTES=$(node -e "process.stdout.write(String(require('zlib').gzipSync(require('fs').readFileSync(process.argv[1])).length))" "$chunk")
  if [ "$GZ_BYTES" -gt "$MAX_GZ_BYTES" ]; then
    MAX_GZ_BYTES="$GZ_BYTES"
    LARGEST_FILE="$chunk"
  fi
done < <(find "$ASSET_DIR" -maxdepth 1 -type f -name 'index-*.js' -print0)

if [ -z "$LARGEST_FILE" ]; then
  echo "[bundle-budget] error: no index-*.js chunks found in $ASSET_DIR" >&2
  exit 2
fi

BUDGET_BYTES=$((BUDGET_KB * 1024))
GZ_KB=$((MAX_GZ_BYTES / 1024))

if [ "$MAX_GZ_BYTES" -gt "$BUDGET_BYTES" ]; then
  echo "[bundle-budget] FAIL: $(basename "$LARGEST_FILE") is ${GZ_KB} KB gzipped (budget ${BUDGET_KB} KB)" >&2
  exit 1
fi

echo "[bundle-budget] OK: $(basename "$LARGEST_FILE") is ${GZ_KB} KB gzipped (budget ${BUDGET_KB} KB, ${MAX_GZ_BYTES} bytes)"
exit 0
