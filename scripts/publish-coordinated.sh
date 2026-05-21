#!/usr/bin/env bash
# T9.1 — Atomic multi-package publish (EC-12).
#
# Publishes `theokit` and `create-theokit` to npm in a single coordinated
# step. Either both succeed or neither does — no half-published state.
#
# Strategy:
#   1. Dry-run EVERY package first (catches version-conflict / auth errors
#      before any real publish).
#   2. Only if all dry-runs succeed, do the real publish.
#   3. If the real publish fails mid-way for package N+1, run
#      `npm dist-tag rm` on packages 1..N to revert.
#
# Usage:
#   NPM_TOKEN=... bash scripts/publish-coordinated.sh                  # latest
#   NPM_TOKEN=... NPM_DIST_TAG=next bash scripts/publish-coordinated.sh # beta

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DIST_TAG="${NPM_DIST_TAG:-latest}"

if [ -z "${NPM_TOKEN:-}" ]; then
  echo "[publish] ERROR: NPM_TOKEN unset." >&2
  exit 2
fi

# Configure npm auth via .npmrc (token is short-lived; not persisted to git).
NPMRC="$ROOT/.npmrc.publish-tmp"
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > "$NPMRC"
cleanup_npmrc() { rm -f "$NPMRC"; }
trap cleanup_npmrc EXIT

PACKAGES=("packages/theo" "packages/create-theo")

# --- Phase 1: dry-run every package ---
echo "[publish] Dry-run all packages..."
for pkg in "${PACKAGES[@]}"; do
  echo "[publish]   ⋯ $pkg"
  if ! (cd "$ROOT/$pkg" && pnpm publish --dry-run --no-git-checks --access public --tag "$DIST_TAG" --userconfig "$NPMRC" >/dev/null 2>&1); then
    echo "[publish] FAIL: dry-run failed for $pkg" >&2
    exit 3
  fi
done
echo "[publish]   ✓ all dry-runs passed"

# --- Phase 2: real publish ---
echo "[publish] Real publish (tag=$DIST_TAG)..."
PUBLISHED=()
ROLLBACK_OK=true
for pkg in "${PACKAGES[@]}"; do
  PKG_NAME="$(node -p "require('$ROOT/$pkg/package.json').name")"
  PKG_VERSION="$(node -p "require('$ROOT/$pkg/package.json').version")"
  echo "[publish]   → $PKG_NAME@$PKG_VERSION"
  if (cd "$ROOT/$pkg" && pnpm publish --no-git-checks --access public --tag "$DIST_TAG" --userconfig "$NPMRC"); then
    PUBLISHED+=("$PKG_NAME@$PKG_VERSION")
  else
    echo "[publish] FAIL: $PKG_NAME failed to publish — initiating rollback" >&2
    # Rollback: remove the dist-tag pointing to what we just published.
    for entry in "${PUBLISHED[@]}"; do
      echo "[publish]   ⤺ rollback: npm dist-tag rm $entry $DIST_TAG"
      if ! npm dist-tag rm "$entry" "$DIST_TAG" --userconfig "$NPMRC" 2>&1; then
        echo "[publish]   ⚠ rollback failed for $entry — manual intervention required" >&2
        ROLLBACK_OK=false
      fi
    done
    if $ROLLBACK_OK; then
      echo "[publish] Rolled back all previously-published packages." >&2
    else
      echo "[publish] PARTIAL FAILURE — registry has dangling entries; manually run \`npm dist-tag rm <pkg>@<v> $DIST_TAG\`" >&2
    fi
    exit 4
  fi
done

echo "[publish] PASS — published ${#PUBLISHED[@]} package(s) to $DIST_TAG"
for entry in "${PUBLISHED[@]}"; do
  echo "[publish]   ✓ $entry"
done
