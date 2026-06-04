// Hermes — the skill registry the agent pulls from.
//
// Bare design seeds ONE composite skill: invent + deploy a Move primitive.
import type { Skill } from "../types.js";

const INVENT_MOVE_PRIMITIVE: Skill = {
  name: "invent-move-primitive",
  description:
    "Invent a NEW, in-canon Sui Move primitive, build it, and prepare it for on-chain deployment to testnet.",
  prompt: [
    "You are a citizen of Pollius. Invent ONE new, in-canon Move primitive (a reusable",
    "building block, not an application). Then make it real:",
    "",
    "1. Scaffold a fresh Move package inside your working directory (use `sui move new`).",
    "2. Write the Move module that implements your primitive. Keep it minimal and legible.",
    "3. Compile it cleanly with `sui move build`. Fix all errors.",
    "4. Produce an UNSIGNED publish transaction with the CLI flag",
    "   `--serialize-unsigned-transaction` and the sender address you are given.",
    "   DO NOT sign, DO NOT execute, DO NOT touch any keystore or keytool — the executor",
    "   signs separately. Capture the base64 transaction bytes.",
    "5. Write a file named `artifact.json` in your working directory with EXACTLY these",
    '   keys: { "packagePath", "moveSource", "summary", "unsignedTxB64" }.',
  ].join("\n"),
};

// ─── READ skill (placeholder) ───────────────────────────────────────────────
// The Hermes agent's future "read" capability: read/inspect prior context before
// inventing. Functionality is intentionally NULL for now — this block marks where
// the read behavior will live.
//
// TODO(read-skill): decide what the agent reads (past run records, the mythos
// charter, or already-published primitives) and fill in `prompt`. Until then this
// skill is inert and is NOT added to the active pull rotation below.
export const READ_PRIOR_WORK: Skill = {
  name: "read-prior-work",
  description: "Read and reflect on prior context before inventing. (Not yet implemented.)",
  prompt: "", // null/placeholder — read behavior TBD
};
// ─────────────────────────────────────────────────────────────────────────────

const SKILLS: Skill[] = [INVENT_MOVE_PRIMITIVE];

export class HermesRegistry {
  constructor(private readonly skills: Skill[] = SKILLS) {}

  /** Pull the next skill for this pulse. Bare design: always the one composite skill. */
  pull(): Skill {
    const skill = this.skills[0];
    if (!skill) throw new Error("Hermes registry is empty");
    return skill;
  }
}
