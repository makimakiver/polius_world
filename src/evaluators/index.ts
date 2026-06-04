// The Evaluator swarm — 4 heterogeneous specialists scored and combined by weighted mean.
import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config.js";
import type { Artifact, Dimension, EvaluatorScore, ExecutionResult, Skill } from "../types.js";
import { RUBRICS } from "./rubrics.js";

const EVAL_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

/** Force each evaluator to return a structured verdict via tool-use. */
const SCORE_TOOL: Anthropic.Tool = {
  name: "submit_score",
  description: "Submit your verdict for this dimension.",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "number", description: "0–100" },
      rationale: { type: "string", description: "One concise paragraph." },
    },
    required: ["score", "rationale"],
  },
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export class EvaluatorSwarm {
  private readonly anthropic: Anthropic;

  constructor(
    private readonly cfg: Config,
    private readonly mythos: string,
  ) {
    this.anthropic = new Anthropic({ apiKey: cfg.anthropicApiKey });
  }

  /** Score the artifact on all dimensions in parallel and aggregate. */
  async evaluate(
    skill: Skill,
    artifact: Artifact,
    execution: ExecutionResult,
  ): Promise<{ scores: EvaluatorScore[]; finalScore: number }> {
    const scores = await Promise.all(
      RUBRICS.map((r) => this.runOne(r.dimension, r.system, skill, artifact, execution)),
    );
    return { scores, finalScore: this.weightedMean(scores) };
  }

  /** Run a single specialist evaluator and extract its structured verdict. */
  private async runOne(
    dimension: Dimension,
    system: string,
    skill: Skill,
    artifact: Artifact,
    execution: ExecutionResult,
  ): Promise<EvaluatorScore> {
    const context = [
      `# Skill\n${skill.name}: ${skill.description}`,
      `# Agent summary\n${artifact.summary}`,
      `# Move source\n\`\`\`move\n${artifact.moveSource}\n\`\`\``,
      `# Testnet execution (ground truth)\n${JSON.stringify(execution, null, 2)}`,
      dimension === "mythos" ? `# Charter (miso.md)\n${this.mythos}` : "",
      "Call submit_score with your verdict.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const res = await this.anthropic.messages.create({
      model: EVAL_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: [SCORE_TOOL],
      tool_choice: { type: "tool", name: "submit_score" },
      messages: [{ role: "user", content: context }],
    });

    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error(`${dimension} evaluator returned no score`);
    }

    const { score, rationale } = block.input as { score: number; rationale: string };
    return { dimension, score: clamp(Number(score), 0, 100), rationale };
  }

  /** Combine per-dimension scores by the configured weights. */
  private weightedMean(scores: EvaluatorScore[]): number {
    const w = this.cfg.weights;
    return scores.reduce((sum, s) => sum + s.score * w[s.dimension], 0);
  }
}
