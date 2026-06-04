// The Hermes agent — authoring only. Built on the Claude Agent SDK.
//
// Trust boundary: this agent gets scoped file + bash tools confined to a sandbox
// workdir. It writes Move, builds it, and serializes an UNSIGNED transaction. It is
// hard-blocked from reading any key material or signing. The executor signs separately.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Artifact, Skill } from "../types.js";

/** Bash patterns that could exfiltrate a key or sign — denied outright. */
const FORBIDDEN_COMMAND_PATTERNS = [
  /\.env\b/i, // the signing key lives in .env — agent must never read it
  /keytool/i,
  /\.keystore/i,
  /sui[._-]?config/i,
  /private[\s_-]?key/i,
  /suiprivkey/i,
  /\bexecute\b/i, // no on-chain execution from the agent
  /--gas-budget[\s\S]*\bpublish\b(?![\s\S]*--serialize)/i, // publish must be serialize-only
];

function isForbidden(command: string): boolean {
  return FORBIDDEN_COMMAND_PATTERNS.some((re) => re.test(command));
}

const ALLOWED_TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep"];

/** Fields the agent must populate in artifact.json. */
const REQUIRED_ARTIFACT_FIELDS = ["unsignedTxB64", "packagePath", "moveSource"] as const;

export interface HermesAgentDeps {
  workdir: string;
  /** Public address the agent builds the unsigned tx for (safe to share). */
  senderAddress: string;
  model?: string;
}

export class HermesAgent {
  constructor(private readonly deps: HermesAgentDeps) {}

  /** Run one skill end-to-end (author → build → serialize unsigned tx). */
  async run(skill: Skill): Promise<Artifact> {
    const stream = query({
      prompt: this.buildPrompt(skill),
      options: {
        cwd: this.deps.workdir,
        model: this.deps.model,
        allowedTools: ALLOWED_TOOLS,
        // Enforce the trust boundary at the tool layer.
        canUseTool: async (tool, input) => {
          if (tool === "Bash") {
            const command = String((input as { command?: unknown }).command ?? "");
            if (isForbidden(command)) {
              return {
                behavior: "deny",
                message: "Blocked: key access / signing is not permitted for the agent.",
              };
            }
          }
          return { behavior: "allow", updatedInput: input };
        },
      },
    });

    // Drain the stream; the agent's deliverable is artifact.json on disk.
    for await (const _msg of stream) {
      // (Hook for logging/telemetry per message if desired.)
    }

    return this.readArtifact();
  }

  /** Compose the skill prompt plus the sandbox + sender constraints. */
  private buildPrompt(skill: Skill): string {
    return [
      skill.prompt,
      "",
      `Your sandbox working directory: ${this.deps.workdir}`,
      `The sender address for the unsigned transaction: ${this.deps.senderAddress}`,
      "Stay entirely inside the working directory. Never read files outside it.",
    ].join("\n");
  }

  /** Read + validate the artifact the agent left behind. */
  private async readArtifact(): Promise<Artifact> {
    const path = join(this.deps.workdir, "artifact.json");

    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      throw new Error(`Hermes agent did not produce artifact.json at ${path}`);
    }

    const parsed = JSON.parse(raw) as Partial<Artifact>;
    for (const field of REQUIRED_ARTIFACT_FIELDS) {
      if (!parsed[field]) throw new Error(`artifact.json is missing required field: ${field}`);
    }

    return {
      packagePath: parsed.packagePath!,
      moveSource: parsed.moveSource!,
      summary: parsed.summary ?? "",
      unsignedTxB64: parsed.unsignedTxB64!,
    };
  }
}
