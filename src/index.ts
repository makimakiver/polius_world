// Pollius — bare cycle entrypoint. Wires the components and starts the scheduler.
import "dotenv/config"; // load .env locally; no-op when absent (e.g. on Railway)
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { HermesRegistry } from "./hermes/registry.js";
import { HermesAgent } from "./agent/hermesAgent.js";
import { Executor, keypairFromSecret } from "./executor/executor.js";
import { EvaluatorSwarm } from "./evaluators/index.js";
import { NoopStorage } from "./storage/storage.js";
import { Heartbeat } from "./heartbeat.js";
import { Scheduler } from "./scheduler.js";

async function main(): Promise<void> {
  const cfg = loadConfig();

  // Identity: the keypair decoded from the env secret. Only the executor sees it.
  const keypair = keypairFromSecret(cfg.keypairSecret);
  const executor = new Executor(keypair, cfg.suiNetwork);
  console.log(`Hermes identity (address): ${executor.address}`);
  console.log(`Network: ${cfg.suiNetwork}`);
  console.log(
    `Schedule: ${cfg.cron}  (run-on-start: ${cfg.runOnStart}, max cycles: ${cfg.maxCycles || "∞"})`,
  );

  const mythos = await readFile(resolve("miso.md"), "utf8");

  const heartbeat = new Heartbeat({
    cfg,
    registry: await HermesRegistry.load(),
    // Agent is given only the PUBLIC address — never the key.
    agent: new HermesAgent({ workdir: cfg.workdir, senderAddress: executor.address }),
    executor,
    evaluators: new EvaluatorSwarm(cfg, mythos),
    storage: new NoopStorage(),
  });

  const scheduler = new Scheduler({
    cron: cfg.cron,
    maxCycles: cfg.maxCycles,
    runOnStart: cfg.runOnStart,
    onBeat: () => heartbeat.beat(),
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      console.log(`\n${signal} — stopping scheduler; finishing any in-flight beat…`);
      scheduler.stop();
    });
  }

  await scheduler.run();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
