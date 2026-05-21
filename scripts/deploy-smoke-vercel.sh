#!/usr/bin/env bash
# T4.1 — Vercel deploy + smoke harness.
#
# Hard-caps the Vercel CLI invocation at 5 minutes (EC-7), runs curl
# assertions against the live preview URL, appends an evidence line to
# deploy-evidence.jsonl at the repo root.
#
# Usage:
#   VERCEL_TOKEN=... bash scripts/deploy-smoke-vercel.sh
#   # OR for a smoke against an already-running local server:
#   LOCAL_URL=http://localhost:3471 bash scripts/deploy-smoke-vercel.sh

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
EXAMPLE_DIR="$ROOT/examples/deploy-vercel"
EVIDENCE_FILE="$ROOT/deploy-evidence.jsonl"

# Detect mode: local or vercel.
URL="${LOCAL_URL:-}"
MODE="local"
if [ -z "$URL" ]; then
  MODE="vercel"
  if [ -z "${VERCEL_TOKEN:-}" ]; then
    echo "[deploy-smoke] ERROR: VERCEL_TOKEN unset and LOCAL_URL not provided." >&2
    echo "[deploy-smoke] Set VERCEL_TOKEN to deploy, or LOCAL_URL to smoke a local server." >&2
    exit 2
  fi
fi

# --- Phase 1: deploy (or skip if smoking local) ---
START=$(date +%s)
if [ "$MODE" = "vercel" ]; then
  cd "$EXAMPLE_DIR"
  echo "[deploy-smoke] Running: timeout 300 vercel deploy --token *** --yes"
  if ! URL="$(timeout 300 vercel deploy --token "$VERCEL_TOKEN" --yes 2>&1 | tail -1)"; then
    echo "[deploy-smoke] FAIL: vercel deploy timed out or errored" >&2
    exit 3
  fi
  if [ -z "$URL" ] || ! echo "$URL" | grep -qE '^https?://'; then
    echo "[deploy-smoke] FAIL: vercel deploy did not return a URL (got: $URL)" >&2
    exit 4
  fi
  echo "[deploy-smoke] Deployed: $URL"
fi

# --- Phase 2: assertions against URL ---
FAIL_COUNT=0
assert_status() {
  local path="$1"
  local expected="$2"
  local actual
  actual="$(curl --max-time 30 -s -o /dev/null -w "%{http_code}" "$URL$path" || echo "000")"
  if [ "$actual" = "$expected" ]; then
    echo "[deploy-smoke]   ✓ $path → $expected"
  else
    echo "[deploy-smoke]   ✗ $path → $actual (expected $expected)" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

assert_contains() {
  local path="$1"
  local needle="$2"
  local body
  body="$(curl --max-time 30 -s "$URL$path" || echo "")"
  if echo "$body" | grep -qF "$needle"; then
    echo "[deploy-smoke]   ✓ $path body contains '$needle'"
  else
    echo "[deploy-smoke]   ✗ $path body MISSING '$needle'" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo "[deploy-smoke] Asserting against $URL"
assert_status "/" "200"
assert_status "/api/health" "200"
assert_contains "/" "TheoKit deployed"
assert_contains "/api/health" '"adapter":"vercel"'

# --- Phase 3: evidence record ---
END=$(date +%s)
DURATION=$((END - START))
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
STATUS="pass"
if [ "$FAIL_COUNT" -gt 0 ]; then STATUS="fail"; fi

# eslint-disable-next-line — bash script, not JS
ENTRY="{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"adapter\":\"vercel\",\"url\":\"$URL\",\"durationSec\":$DURATION,\"status\":\"$STATUS\",\"commit\":\"$COMMIT\",\"mode\":\"$MODE\"}"
echo "$ENTRY" >> "$EVIDENCE_FILE"
echo "[deploy-smoke] Recorded: $ENTRY"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "[deploy-smoke] FAIL ($FAIL_COUNT assertion(s))" >&2
  exit 1
fi
echo "[deploy-smoke] PASS"
