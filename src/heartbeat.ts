// The Heartbeat — one pulse of the Pollius cycle.
//
// One beat = pull skill → author (Hermes agent) → execute on testnet (executor)
// → score (evaluator swarm) → hand to storage. The Scheduler decides WHEN beats fire.
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import type { Config } from "./config.js";
import type { HermesAgent } from "./agent/hermesAgent.js";
import type { Executor } from "./executor/executor.js";
import type { EvaluatorSwarm } from "./evaluators/index.js";
import type { HermesRegistry } from "./hermes/registry.js";
import type { RunRecord, Storage } from "./types.js";

export interface HeartbeatDeps {
  cfg: Config;
  registry: HermesRegistry;
  agent: HermesAgent;
  executor: Executor;
  evaluators: EvaluatorSwarm;
  storage: Storage;
}

export class Heartbeat {
  #cycle = 0;

  constructor(private readonly d: HeartbeatDeps) {}

  /** Run exactly one pulse: pull → author → execute → score → store. */
  async beat(): Promise<void> {
    const { registry, agent, executor, evaluators, storage, cfg } = this.d;
    const cycle = (this.#cycle += 1);
    const runId = randomUUID();
    console.log(`\n♥ beat #${cycle} — run ${runId}`);

    // Fresh sandbox per beat so artifacts don't bleed between runs.
    await mkdir(cfg.workdir, { recursive: true });

    const skill = registry.pull();
    console.log(`  pulled skill: ${skill.name}`);

    const artifact = await agent.run(skill);
    console.log(`  authored: ${artifact.summary || "(no summary)"}`);

    const execution = await executor.execute(artifact);
    console.log(
      `  executed: ${execution.success ? "✓" : "✗"}` +
        (execution.digest ? ` digest=${execution.digest}` : "") +
        (execution.error ? ` error=${execution.error}` : ""),
    );

    const { scores, finalScore } = await evaluators.evaluate(skill, artifact, execution);
    for (const s of scores) {
      const label = s.dimension.padEnd(11);
      const value = s.score.toFixed(0).padStart(3);
      console.log(`  ${label} ${value}  ${s.rationale.slice(0, 80)}`);
    }
    console.log(`  final score: ${finalScore.toFixed(1)}`);

    const record: RunRecord = {
      runId,
      agentAddress: executor.address,
      skillName: skill.name,
      artifact,
      execution,
      scores,
      finalScore,
      ts: new Date().toISOString(),
    };

    // Persistence seam — STOP. MemWal takes it from here.
    await storage.store(record);
  }
}
