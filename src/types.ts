// Core domain types for the Pollius bare cycle.
//
// One pass through the cycle turns a Skill into an Artifact (authored by the agent),
// an ExecutionResult (produced by the trusted executor), and a set of EvaluatorScores
// — all bundled into a RunRecord and handed to Storage.

/** A capability the Hermes agent can pull from the registry and perform. */
export interface Skill {
  name: string;
  description: string;
  /** Instructions handed to the Hermes agent when it runs this skill. */
  prompt: string;
}

/**
 * What the Hermes agent produces in the authoring phase. The agent NEVER signs:
 * it emits Move source plus an *unsigned* transaction (base64) that the trusted
 * executor will sign and submit.
 */
export interface Artifact {
  /** Absolute path to the package the agent wrote (inside the sandbox workdir). */
  packagePath: string;
  /** The primary Move source the agent authored, inlined for the evaluators. */
  moveSource: string;
  /** One-line summary of the primitive, written by the agent. */
  summary: string;
  /** Base64 BCS bytes of the unsigned transaction (publish and/or PTB). */
  unsignedTxB64: string;
}

/** Result of the trusted executor signing + submitting on testnet. */
export interface ExecutionResult {
  success: boolean;
  /** Transaction digest when submitted (present even on on-chain failure). */
  digest?: string;
  /** Object IDs created/mutated, when the tx succeeded. */
  objectChanges?: unknown;
  /** Execution status string from the node, e.g. "success" | "failure". */
  status?: string;
  /** Error text when authoring/build/submit failed before or at execution. */
  error?: string;
}

/** The four heterogeneous dimensions the evaluator swarm scores. */
export type Dimension = "correctness" | "security" | "novelty" | "mythos";

/** One evaluator's verdict on a single dimension. */
export interface EvaluatorScore {
  dimension: Dimension;
  /** 0–100. */
  score: number;
  rationale: string;
}

/** The full record of one heartbeat cycle, handed to storage. */
export interface RunRecord {
  runId: string;
  /** The agent's public Sui address (its identity anchor). Never the key. */
  agentAddress: string;
  skillName: string;
  artifact: Artifact;
  execution: ExecutionResult;
  scores: EvaluatorScore[];
  /** Weighted mean of the four dimensions, 0–100. */
  finalScore: number;
  /** ISO timestamp. */
  ts: string;
}

/**
 * Persistence seam. The bare design STOPS here — `MemWal` (Walrus-backed storage)
 * plugs in behind this interface. Nothing in the cycle persists on its own.
 */
export interface Storage {
  store(record: RunRecord): Promise<void>;
}
