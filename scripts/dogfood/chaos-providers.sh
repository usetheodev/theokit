#!/usr/bin/env bash
# chaos-providers.sh — Stranger chaos test helper (Phases 12-15).
#
# Usage:
#   chaos-providers.sh <scenario> <sandbox-path> <port>
#   chaos-providers.sh --help
#
# Scenarios:
#   invalid-key        — replace OPENROUTER_API_KEY with sk-or-INVALID; restart; probe; restore
#   rate-limit         — D14 fault injection 429 (requires SDK >= 1.2 with THEOKIT_TEST_RESPONSE_OVERRIDE)
#   nonexistent-model  — edit chat.ts to use fake model id; HMR pickup; probe; restore
#   server-error       — D14 fault injection 503 (requires D14 SDK support)
#
# Output (stdout, last lines):
#   RESULT=PASS|FAIL|SKIP
#   REASON=<short description>
#
# Exit code: always 0 (caller decides via RESULT=)
#
# Requires: bash 4+, curl, lsof, sed, grep. Sandbox must contain a scaffolded
# theokit app with `pnpm dev` available (node_modules installed).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "$SCRIPT_DIR/_lib.sh"

# ────────────────────────────────────────────────────────────────────────────
# Args + help
# ────────────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's|^# \?||'
  exit 0
fi

if [[ $# -ne 3 ]]; then
  echo "ERROR: expected 3 args, got $#. Use --help for usage." >&2
  exit 64
fi

SCENARIO="$1"
SANDBOX="$2"
PORT="$3"

# ────────────────────────────────────────────────────────────────────────────
# Cleanup (trap-driven — idempotent restore)
# ────────────────────────────────────────────────────────────────────────────

DEV_PID=""

cleanup() {
  kill_pid_safe "$DEV_PID"
  # Restore any backup files we may have created (idempotent)
  if [[ -f "$SANDBOX/.env.bak-chaos" ]]; then
    mv -f "$SANDBOX/.env.bak-chaos" "$SANDBOX/.env" 2>/dev/null || true
  fi
  if [[ -f "$SANDBOX/server/routes/chat.ts.bak-chaos" ]]; then
    mv -f "$SANDBOX/server/routes/chat.ts.bak-chaos" "$SANDBOX/server/routes/chat.ts" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ────────────────────────────────────────────────────────────────────────────
# Validations
# ────────────────────────────────────────────────────────────────────────────

if [[ ! -d "$SANDBOX" ]]; then
  emit_result SKIP "sandbox_not_found"
  exit 0
fi

if [[ ! -d "$SANDBOX/node_modules" ]]; then
  emit_result SKIP "node_modules_missing"
  exit 0
fi

# ────────────────────────────────────────────────────────────────────────────
# Scenario implementations
# ────────────────────────────────────────────────────────────────────────────

function start_dev_server() {
  local env_extra=("$@")
  local log="$SANDBOX/dev-chaos-$$.log"
  local theokit_bin="$SANDBOX/node_modules/.bin/theokit"
  if [[ ! -x "$theokit_bin" ]]; then
    return 1
  fi
  cd "$SANDBOX"
  # Direct binary invocation — bypass pnpm wrapper's deps-status-check
  # (pnpm 11+ trips on ERR_PNPM_IGNORED_BUILDS even with onlyBuiltDependencies).
  if [[ ${#env_extra[@]} -gt 0 ]]; then
    nohup env "${env_extra[@]}" "$theokit_bin" dev --port="$PORT" >"$log" 2>&1 &
  else
    nohup "$theokit_bin" dev --port="$PORT" >"$log" 2>&1 &
  fi
  DEV_PID=$!
  cd - >/dev/null
  if ! wait_for_port "$PORT" 30; then
    return 1
  fi
  return 0
}

function probe_chat() {
  local timeout_s="${1:-20}"
  curl -s -N --max-time "$timeout_s" \
    -H "Content-Type: application/json" \
    -H "X-Theo-Action: 1" \
    -X POST "http://localhost:$PORT/api/chat" \
    -d '{"message":"chaos test probe"}' 2>&1 || true
}

function scenario_invalid_key() {
  if [[ ! -f "$SANDBOX/.env" ]]; then
    emit_result SKIP "no_env_file"
    return
  fi
  cp "$SANDBOX/.env" "$SANDBOX/.env.bak-chaos"
  sed -i 's/^OPENROUTER_API_KEY=.*/OPENROUTER_API_KEY=sk-or-INVALID-FORCE-401/' "$SANDBOX/.env"

  # CRITICAL: must pass invalid key via process env too — theokit dev reads
  # both .env AND process.env, with process.env taking precedence in dotenv.
  # If we only edit .env, the parent shell's exported OPENROUTER_API_KEY
  # (set by /tmp/dogfood-env.sh) overrides → false negative.
  if ! start_dev_server "OPENROUTER_API_KEY=sk-or-INVALID-FORCE-401"; then
    emit_result FAIL "dev_server_failed_to_start"
    return
  fi

  local resp
  resp="$(probe_chat 20)"

  # EC-6 MUST FIX (sdk-error-packaging-fix-plan v1.1):
  # Double-negative check. After the SDK 1.3.0 Finding-B fix, an invalid
  # key MUST surface as a typed error event AND MUST NOT leak as an
  # assistant message containing the verbatim error text.
  #
  # Pre-fix (SDK <= 1.2.x) wire bytes:
  #   data: {"type":"message","content":"openrouter API error: auth_failed (HTTP 401)"}
  # Post-fix wire bytes:
  #   data: {"type":"error","message":"...","code":"openrouter_auth_failed"}
  #
  # Old check (`grep -qiE 'error|401|invalid|auth|missing'`) passed in
  # BOTH cases — it could not detect Finding-B regression.
  local has_typed_error="no"
  local has_leaked_assistant="no"
  if echo "$resp" | grep -qE '"type"[[:space:]]*:[[:space:]]*"error"'; then
    has_typed_error="yes"
  fi
  if echo "$resp" \
    | grep -E '"type"[[:space:]]*:[[:space:]]*"message"' \
    | grep -qiE '401|auth_failed|invalid.api.key|unauthorized|api.error'; then
    has_leaked_assistant="yes"
  fi

  if [[ "$has_typed_error" == "yes" && "$has_leaked_assistant" == "no" ]]; then
    emit_result PASS "invalid_key_typed_error_no_assistant_leak"
  elif [[ "$has_leaked_assistant" == "yes" ]]; then
    emit_result FAIL "FINDING_B_REGRESSION:error_leaked_as_assistant (resp: $(echo "$resp" | head -c 200))"
  elif [[ "$has_typed_error" == "no" ]]; then
    emit_result FAIL "no_typed_error_event_emitted (resp: $(echo "$resp" | head -c 200))"
  fi
}

function scenario_rate_limit() {
  if ! sdk_supports_d14 "$SANDBOX"; then
    emit_result SKIP "d14_not_supported_in_sdk"
    return
  fi
  local override='{"status":429,"body":{"error":{"code":"rate_limit_exceeded","message":"Rate limit hit; retry in 60s"}}}'

  if ! start_dev_server "NODE_ENV=test" "THEOKIT_TEST_RESPONSE_OVERRIDE=$override"; then
    emit_result FAIL "dev_server_failed_to_start"
    return
  fi

  local resp
  resp="$(probe_chat 20)"
  if echo "$resp" | grep -qiE 'rate.?limit|429'; then
    emit_result PASS "rate_limit_handled_gracefully"
  else
    emit_result FAIL "rate_limit_not_surfaced"
  fi
}

function scenario_nonexistent_model() {
  local chat="$SANDBOX/server/routes/chat.ts"
  if [[ ! -f "$chat" ]]; then
    emit_result SKIP "chat_route_not_found"
    return
  fi
  cp "$chat" "$chat.bak-chaos"
  # Match common patterns (default template uses gpt-4o-mini; saas may use claude-3.5)
  sed -i "s|gpt-4o-mini|fake-nonexistent-model-12345|g" "$chat"
  sed -i "s|claude-3-5-sonnet|fake-nonexistent-model-12345|g" "$chat"

  if ! start_dev_server; then
    emit_result FAIL "dev_server_failed_to_start"
    return
  fi

  local resp
  resp="$(probe_chat 25)"
  if echo "$resp" | grep -qiE 'model.*not.*found|invalid.*model|400|404|fake-nonexistent'; then
    emit_result PASS "nonexistent_model_rejected"
  else
    emit_result FAIL "nonexistent_model_no_error_surfaced"
  fi
}

function scenario_server_error() {
  if ! sdk_supports_d14 "$SANDBOX"; then
    emit_result SKIP "d14_not_supported_in_sdk"
    return
  fi
  local override='{"status":503,"body":{"error":{"code":"service_unavailable","message":"Provider down"}}}'

  if ! start_dev_server "NODE_ENV=test" "THEOKIT_TEST_RESPONSE_OVERRIDE=$override"; then
    emit_result FAIL "dev_server_failed_to_start"
    return
  fi

  local resp
  resp="$(probe_chat 20)"
  if echo "$resp" | grep -qiE '5\d\d|unavailable|service.*error|server.error'; then
    emit_result PASS "server_error_handled_gracefully"
  else
    emit_result FAIL "server_error_not_surfaced"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# Dispatch
# ────────────────────────────────────────────────────────────────────────────

case "$SCENARIO" in
  invalid-key)        scenario_invalid_key ;;
  rate-limit)         scenario_rate_limit ;;
  nonexistent-model)  scenario_nonexistent_model ;;
  server-error)       scenario_server_error ;;
  *)
    emit_result SKIP "unknown_scenario:$SCENARIO"
    exit 0
    ;;
esac
