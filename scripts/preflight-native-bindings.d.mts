/**
 * Ambient declaration for the preflight ESM script (theokit copy).
 * Matches the exports in preflight-native-bindings.mjs.
 */
export function findRebuildCwd(
  failingBindingPath: string | undefined,
  defaultCwd: string,
): string;
export function ensureNativeBindings(): Promise<void>;
