#!/usr/bin/env bash
# multi-template-smoke.sh — Single-template smoke test (Phases 16-19).
#
# Usage:
#   multi-template-smoke.sh <template> <port>
#   multi-template-smoke.sh --help
#
# Templates: dashboard | api-only | postgres | saas | default
# Ports:     deterministic per template per plan (dashboard=4100, api-only=4200,
#            postgres=4300, saas=4400, default=4000)
#
# Behavior:
#   1. Pre-flight: port free? (else SKIP)
#   2. Create sandbox in /tmp/theokit-stranger-multi-<template>-<pid>/
#   3. npx create-theokit@latest my-<template> --template=<template> --skip-install
#   4. pnpm install
#   5. pnpm dev --port=<port> (background, timeout 60s for boot)
#   6. curl probe: /api/health if present, else /
#   7. kill dev + cleanup sandbox
#
# Output (stdout, last lines):
#   RESULT=PASS|FAIL|SKIP
#   REASON=<short description>
#   HTTP_CODE=<numeric code or empty>
#
# Exit code: always 0.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "$SCRIPT_DIR/_lib.sh"

# ────────────────────────────────────────────────────────────────────────────
# Args + help
# ────────────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's|^# \?||'
  exit 0
fi

if [[ $# -ne 2 ]]; then
  echo "ERROR: expected 2 args (<template> <port>), got $#. Use --help for usage." >&2
  exit 64
fi

TEMPLATE="$1"
PORT="$2"

# Validate template against known set
case "$TEMPLATE" in
  default|dashboard|api-only|postgres|saas) ;;
  *)
    emit_result SKIP "unknown_template:$TEMPLATE"
    echo "HTTP_CODE="
    exit 0
    ;;
esac

# ────────────────────────────────────────────────────────────────────────────
# Cleanup (trap-driven)
# ────────────────────────────────────────────────────────────────────────────

SBX=""
DEV_PID=""

cleanup() {
  kill_pid_safe "$DEV_PID"
  if [[ -n "$SBX" && -d "$SBX" ]]; then
    rm -rf "$SBX" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ────────────────────────────────────────────────────────────────────────────
# Pre-flight
# ────────────────────────────────────────────────────────────────────────────

if ! is_port_free "$PORT"; then
  emit_result SKIP "port_busy:$PORT"
  echo "HTTP_CODE="
  exit 0
fi

# ────────────────────────────────────────────────────────────────────────────
# Scaffold + install + boot + probe
# ────────────────────────────────────────────────────────────────────────────

SBX="$(mktemp -d "/tmp/theokit-stranger-multi-${TEMPLATE}-XXXXXX")"
APP_DIR="$SBX/my-$TEMPLATE"

# Step 1: scaffold (use --skip-install per plan)
# IMPORTANT: cd to sandbox BEFORE scaffold — create-theokit creates the project
# in the current working directory.
echo "[smoke:$TEMPLATE] scaffolding..." >&2
cd "$SBX"
if ! npx -y create-theokit@latest "my-$TEMPLATE" --template="$TEMPLATE" --skip-install \
     >"$SBX/scaffold.log" 2>&1 < /dev/null; then
  # Retry without `=` separator (older create-theokit CLI variants)
  if ! npx -y create-theokit@latest "my-$TEMPLATE" --template "$TEMPLATE" --skip-install \
       >"$SBX/scaffold.log" 2>&1 < /dev/null; then
    emit_result FAIL "scaffold_failed"
    echo "HTTP_CODE="
    exit 0
  fi
fi

if [[ ! -d "$APP_DIR" ]]; then
  emit_result FAIL "scaffold_no_app_dir"
  echo "HTTP_CODE="
  exit 0
fi

# Step 2: install
# pnpm 9+ exits non-zero on `ERR_PNPM_IGNORED_BUILDS` (esbuild postinstall blocked
# by default for security). The install is still complete and usable — verify by
# checking that node_modules + theokit binary exist, not by exit code.
echo "[smoke:$TEMPLATE] installing..." >&2
cd "$APP_DIR"
pnpm install --prefer-offline >"$SBX/install.log" 2>&1 || true
if [[ ! -d "$APP_DIR/node_modules/theokit" ]]; then
  emit_result FAIL "install_failed_theokit_missing"
  echo "HTTP_CODE="
  exit 0
fi

# Step 3: boot dev (invoke theokit binary directly — bypass pnpm wrapper which
# adds a pre-command deps-status-check that trips on `ERR_PNPM_IGNORED_BUILDS`
# in pnpm 11+ even when `pnpm.onlyBuiltDependencies` is declared. Direct
# invocation mirrors what `npx theokit dev` would do for an npm-using stranger).
echo "[smoke:$TEMPLATE] booting dev on port $PORT..." >&2
if [[ ! -x "$APP_DIR/node_modules/.bin/theokit" ]]; then
  emit_result FAIL "theokit_binary_missing"
  echo "HTTP_CODE="
  exit 0
fi
nohup "$APP_DIR/node_modules/.bin/theokit" dev --port="$PORT" >"$SBX/dev.log" 2>&1 &
DEV_PID=$!

# Wait up to 60s for port (templates with DB / heavier setup take longer)
if ! wait_for_port "$PORT" 60; then
  emit_result FAIL "dev_server_boot_timeout"
  echo "HTTP_CODE="
  exit 0
fi

# Step 4: probe — use /api/health if route exists, else /
PROBE_PATH="/"
if [[ -f "$APP_DIR/server/routes/health.ts" ]]; then
  PROBE_PATH="/api/health"
fi

HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$PORT$PROBE_PATH" 2>/dev/null || echo "")"

# Step 5: classify
case "$HTTP_CODE" in
  200|304)
    emit_result PASS "smoke_ok:$PROBE_PATH" "HTTP_CODE=$HTTP_CODE"
    ;;
  404)
    if [[ "$PROBE_PATH" == "/" ]]; then
      # Root 404 on a template without index can be acceptable; check if /api/health exists
      ALT_CODE="$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:$PORT/api/health" 2>/dev/null || echo "")"
      if [[ "$ALT_CODE" == "200" ]]; then
        emit_result PASS "smoke_ok:/api/health_fallback" "HTTP_CODE=$ALT_CODE"
      else
        emit_result FAIL "root_404_and_no_health" "HTTP_CODE=$HTTP_CODE"
      fi
    else
      emit_result FAIL "probe_404:$PROBE_PATH" "HTTP_CODE=$HTTP_CODE"
    fi
    ;;
  "")
    emit_result FAIL "probe_no_response" "HTTP_CODE="
    ;;
  5*)
    emit_result FAIL "server_error:$PROBE_PATH" "HTTP_CODE=$HTTP_CODE"
    ;;
  *)
    emit_result FAIL "unexpected_code:$HTTP_CODE" "HTTP_CODE=$HTTP_CODE"
    ;;
esac
