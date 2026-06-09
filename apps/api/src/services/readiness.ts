export function isRustCoreRequired(policyEngine: string, sandboxEngine: string) {
  return requiresRustEngine(policyEngine) || requiresRustEngine(sandboxEngine);
}

function requiresRustEngine(engine: string) {
  return engine === "rust_core" || engine === "rust_core_strict";
}
