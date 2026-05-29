#!/usr/bin/env node
// dogfood-regressions-fix-plan v1.1 — T1.2: Native bindings preflight (theokit).
//
// Mirrors theokit-sdk/tools/preflight-native-bindings.mjs but probes theokit's
// own consuming packages. Detects NODE_MODULE_VERSION mismatch on better-sqlite3
// and auto-rebuilds. One-shot per session via sentinel cache. Fail-fast in CI.
//
// Wired in: tests/setup-native-bindings.ts (vitest globalSetup).
//
// Why this exists:
//   See theokit-sdk/tools/preflight-native-bindings.mjs header. Same root cause:
//   pnpm only warns on engines.node mismatch; bindings end up compiled for
//   whatever Node was active at install-time.
//
// See: theokit/CLAUDE.md > "Native bindings discipline".

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(__dirname, "..");

// ADD new native deps here when shipped. Auto-discovery rejected as YAGNI
// per plan EC-6.
const NATIVE_DEPS = ["better-sqlite3"];

// EC-1 / EC-5: theokit consumes @usetheo/sdk via workspace link AND has its
// own native deps. Probe both the consuming package roots (where tests live)
// AND the workspace root.
const PROBE_ROOTS = [
  resolve(WORKSPACE_ROOT, "packages/theo"),
  WORKSPACE_ROOT,
];

const SENTINEL_DIR = resolve(WORKSPACE_ROOT, "node_modules/.cache");
const SENTINEL = resolve(
  SENTINEL_DIR,
  `preflight-native-${process.versions.modules}.ok`,
);

// EC-2 MUST FIX: 5 min covers cold builds on low-end / CI free-tier / ARM.
const REBUILD_TIMEOUT_MS = 300_000;

function isAbiError(err) {
  if (err === null || err === undefined) return false;
  const msg = String(err.message ?? err);
  const cause = err.cause !== undefined ? String(err.cause.message ?? err.cause) : "";
  return /NODE_MODULE_VERSION|did not self-register|was compiled against/.test(
    msg + " " + cause,
  );
}

function extractBindingPath(err) {
  const msg = String(err.message ?? err) + " " + String(err.cause?.message ?? "");
  const m = msg.match(/['"]([^'"]+\.node)['"]/);
  return m ? m[1] : undefined;
}

function probeRequire(dep) {
  let lastNotFound;
  for (const root of PROBE_ROOTS) {
    try {
      const req = createRequire(resolve(root, "package.json"));
      const resolved = req.resolve(dep);
      delete req.cache?.[resolved];
      const mod = req(dep);
      exerciseDep(dep, mod);
    } catch (error) {
      if (error?.code === "MODULE_NOT_FOUND") {
        lastNotFound = error;
        continue;
      }
      return {
        ok: false,
        error,
        bindingPath: extractBindingPath(error),
        probeRoot: root,
      };
    }
  }
  return { ok: true, missing: lastNotFound !== undefined };
}

/**
 * Per-dep no-op exercise that forces the dlopen of the native binding.
 * See SDK preflight for rationale.
 */
function exerciseDep(dep, mod) {
  switch (dep) {
    case "better-sqlite3": {
      const Database = mod.default ?? mod;
      const db = new Database(":memory:");
      db.close();
      return;
    }
    default:
      throw new Error(
        `[preflight-native-bindings] No exercise() defined for native dep '${dep}'. Add a case in exerciseDep() to drive the binding's dlopen.`,
      );
  }
}

/**
 * EC-1 MUST FIX: when the failing binding lives under a workspace-link or in
 * a sibling repo's node_modules (e.g., the SDK's better-sqlite3 hardlinked
 * via pnpm store), `pnpm rebuild` from the local cwd does NOT touch it.
 * Resolve real path of binding + walk up to the containing repo root.
 *
 * Idempotent: returns defaultCwd if the binding is local (no symlink hop).
 */
export function findRebuildCwd(failingBindingPath, defaultCwd) {
  if (failingBindingPath === undefined) return defaultCwd;
  let real;
  try {
    real = realpathSync(failingBindingPath);
  } catch {
    return defaultCwd;
  }
  const m = real.match(/^(.+)\/node_modules\/\.pnpm\/[^/]+@[^/]+\//);
  return m !== null ? m[1] : defaultCwd;
}

function runRebuild(dep, bindingPath) {
  const cwd = findRebuildCwd(bindingPath, WORKSPACE_ROOT);
  process.stderr.write(
    `[preflight-native-bindings] Rebuilding '${dep}' in ${cwd} (Node ${process.versions.node}, ABI ${process.versions.modules})...\n`,
  );
  const result = spawnSync("pnpm", ["rebuild", dep], {
    stdio: "inherit",
    shell: false,
    cwd,
    timeout: REBUILD_TIMEOUT_MS,
  });
  return { exitCode: result.status, signal: result.signal, error: result.error };
}

function formatActionableError(dep, err, currentNode) {
  const RED = "\x1b[31m";
  const BOLD = "\x1b[1m";
  const DIM = "\x1b[2m";
  const RESET = "\x1b[0m";
  return [
    "",
    `${RED}${BOLD}[preflight-native-bindings] Failed to rebuild '${dep}' for Node ${currentNode}.${RESET}`,
    "",
    `${DIM}Original error:${RESET} ${err.message ?? err}`,
    "",
    `${DIM}This usually means:${RESET}`,
    `  1. node-gyp prerequisites missing (python3, make, C++ compiler)`,
    `  2. Node version below engines.node floor (>=22.12.0)`,
    "",
    `${DIM}Fix:${RESET}`,
    `  pnpm rebuild ${dep}             # manual retry`,
    `  nvm use                         # switch to .nvmrc Node version`,
    `  nvm install                     # if you don't have it`,
    "",
    "See: CLAUDE.md > 'Native bindings discipline' section.",
    "",
  ].join("\n");
}

export async function ensureNativeBindings() {
  const inCi = process.env.CI === "true" || process.env.CI === "1";

  if (existsSync(SENTINEL)) return;

  for (const dep of NATIVE_DEPS) {
    const result = probeRequire(dep);
    if (result.ok) continue;

    if (!isAbiError(result.error)) {
      throw result.error;
    }

    if (inCi) {
      process.stderr.write(formatActionableError(dep, result.error, process.versions.node));
      process.stderr.write(
        "\n[preflight-native-bindings] CI=true — skipping auto-rebuild. Workflow must ship an explicit `pnpm rebuild` step (T4.2).\n",
      );
      process.exit(1);
    }

    const rebuild = runRebuild(dep, result.bindingPath);
    if (rebuild.exitCode !== 0) {
      process.stderr.write(
        `\n[preflight-native-bindings] pnpm rebuild exited with code ${rebuild.exitCode}${rebuild.signal !== null ? " (signal " + rebuild.signal + ")" : ""}.\n`,
      );
      process.stderr.write(
        formatActionableError(dep, rebuild.error ?? result.error, process.versions.node),
      );
      process.exit(1);
    }

    mkdirSync(SENTINEL_DIR, { recursive: true });
    writeFileSync(
      SENTINEL,
      `${new Date().toISOString()} Node ${process.versions.node} ABI ${process.versions.modules} (rebuilt)\n`,
    );
    throw new Error(
      `[preflight-native-bindings] '${dep}' rebuilt successfully for Node ${process.versions.node}. ` +
        "Node's dlopen cache requires a process restart to load the fresh binding. " +
        "Re-run your command — subsequent runs will hit the sentinel fast-path and proceed cleanly.",
    );
  }

  mkdirSync(SENTINEL_DIR, { recursive: true });
  writeFileSync(SENTINEL, `${new Date().toISOString()} Node ${process.versions.node} ABI ${process.versions.modules}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureNativeBindings().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
