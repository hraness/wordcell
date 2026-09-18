import { evaluateOhProjectionV1, type OhProjectionDatasetV1, type OhProjectionEvaluationOptionsV1, type OhProjectionQueryV1, type OhProjectionResultV1, type OhProjectionRulePackV1, type OhProjectionSnapshotV1 } from "@hraness/oh/projection";

interface ProjectionRustEngineV1 {
  readonly engine: "oh.projection.rust.v1";
  evaluate(input: Readonly<{
    dataset: OhProjectionDatasetV1;
    options?: OhProjectionEvaluationOptionsV1;
    query: OhProjectionQueryV1;
    rulePack: OhProjectionRulePackV1;
    snapshot: OhProjectionSnapshotV1;
  }>): OhProjectionResultV1;
}

let cached: ProjectionRustEngineV1 | null | undefined;
const emittedFallbackNotices = new Set<string>();

export function emitProjectionRustFallback(reason: "load-failed" | "evaluate-failed"): void {
  if (emittedFallbackNotices.has(reason)) return;
  emittedFallbackNotices.add(reason);
  try {
    console.error(`[oh-projection-rust-fallback] ${reason}`);
  } catch {
    return;
  }
}

const OH_PROJECTION_RUST_MODULE = "@hraness/oh/projection/rust";

async function loadEngine(): Promise<ProjectionRustEngineV1 | null> {
  if (cached !== undefined) return cached;
  try {
    const module = (await import(OH_PROJECTION_RUST_MODULE)) as {
      loadProjectionRustEngineV1?(): Promise<ProjectionRustEngineV1 | null>;
    };
    if (typeof module.loadProjectionRustEngineV1 !== "function") {
      cached = null;
      return null;
    }
    cached = await module.loadProjectionRustEngineV1();
  } catch {
    emitProjectionRustFallback("load-failed");
    cached = null;
  }
  return cached;
}

/** Load the optional Rust projection engine once per process. */
export async function loadProjectionRustEngineV1(): Promise<ProjectionRustEngineV1 | null> {
  return loadEngine();
}

/** Evaluate a projection, preferring the Rust engine when available. */
export function evaluateOhProjectionWithFallbackV1(input: Readonly<{
  dataset: OhProjectionDatasetV1;
  engine: ProjectionRustEngineV1 | null;
  options?: OhProjectionEvaluationOptionsV1;
  query: OhProjectionQueryV1;
  rulePack: OhProjectionRulePackV1;
  snapshot: OhProjectionSnapshotV1;
}>): OhProjectionResultV1 {
  if (input.engine !== null) {
    try {
      return input.engine.evaluate(input);
    } catch {
      emitProjectionRustFallback("evaluate-failed");
    }
  }
  return evaluateOhProjectionV1(input);
}
