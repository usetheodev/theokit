#!/usr/bin/env bash
# Shared utilities for dogfood-stranger helpers (D3 + ADR D5 of
# `dogfood-skill-coverage-completion-plan.md`).
#
# Source this from each helper:
#   source "$(dirname "$0")/_lib.sh"
#
# Conventions:
#   - All functions return 0 (caller checks output, not exit code, for SKIP semantics)
#   - Functions emit progress to stderr; final RESULT/REASON lines to stdout
#   - Idempotent — safe to call kill_pid_safe twice in a row

set -euo pipefail

# Check if a TCP port is free (returns 0 if free, 1 if busy).
function is_port_free() {
  local port="$1"
  ! lsof -i ":$port" >/dev/null 2>&1
}

# Wait for a port to start accepting connections; returns 0 on success, 1 on timeout.
function wait_for_port() {
  local port="$1"
  local timeout_s="${2:-30}"
  local elapsed=0
  while [[ $elapsed -lt $timeout_s ]]; do
    if curl -s -o /dev/null --max-time 1 "http://localhost:$port/" 2>/dev/null; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

# Kill a PID without failing if already dead.
function kill_pid_safe() {
  local pid="${1:-}"
  [[ -z "$pid" ]] && return 0
  kill -9 "$pid" 2>/dev/null || true
  return 0
}

# Emit standardized output (writes RESULT= and REASON= to stdout).
# Usage: emit_result PASS|FAIL|SKIP "reason text" [extra_kv1=val1 ...]
function emit_result() {
  local result="$1"
  local reason="$2"
  shift 2
  echo "RESULT=$result"
  echo "REASON=$reason"
  while [[ $# -gt 0 ]]; do
    echo "$1"
    shift
  done
}

# Check if a SDK build at <node_modules-path> supports D14 fault injection.
# Returns 0 if THEOKIT_TEST_RESPONSE_OVERRIDE found, 1 otherwise.
function sdk_supports_d14() {
  local sandbox="$1"
  local sdk_dist="$sandbox/node_modules/@usetheo/sdk/dist/index.js"
  [[ -f "$sdk_dist" ]] || return 1
  grep -q "THEOKIT_TEST_RESPONSE_OVERRIDE" "$sdk_dist" 2>/dev/null
}
