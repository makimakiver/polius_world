# Scheduled Heartbeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the heartbeat's in-process `setTimeout` sleep loop with a resident cron-driven `Scheduler` that wakes the agent on a cron schedule, coalescing overlapping ticks into a single catch-up beat.

**Architecture:** A new `Scheduler` owns a `croner` cron job and is the sole decider of *when* beats fire. `Heartbeat` is reduced to "run exactly one beat" (`beat()` public, `run()` removed). The pull → author → execute → score → store pipeline and the agent⇄executor trust boundary are unchanged.

**Tech Stack:** TypeScript (ESM, NodeNext), `tsx`, `croner` (^9) for cron scheduling, Node's built-in `node:test` runner for unit tests.

> **Repo note:** This project is **not** a git repository and has **no** test runner yet. Task 1 adds the `test` script. Commit steps below are **optional** — run `git init` first if you want them, otherwise skip the commit step and rely on `pnpm typecheck` / `pnpm test` as the gate.

> **Spec:** `docs/superpowers/specs/2026-06-04-scheduled-heartbeat-design.md`

---

## File Structure

- **Create** `src/scheduler.ts` — the cron-driven scheduler; owns timing, overlap coalescing, and the `maxCycles` stop condition.
- **Create** `src/scheduler.test.ts` — unit tests for the scheduler's beat/queue/stop logic (drives `tick()` directly, no real timers).
- **Modify** `src/heartbeat.ts` — remove `run()` and the `sleep` helper; make `beat()` public and self-numbering.
- **Modify** `src/config.ts` — drop `cooldownS`; add `cron` and `runOnStart`.
- **Modify** `src/index.ts` — build a `Scheduler` around the `Heartbeat`, install signal handlers, await `scheduler.run()`.
- **Modify** `package.json` — add `croner` dependency and a `test` script.
- **Modify** `.env.example` — drop `HEARTBEAT_COOLDOWN_S`; add `HEARTBEAT_CRON`, `HEARTBEAT_RUN_ON_START`.

---

## Task 1: Add the `croner` dependency and a test script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `croner` to dependencies and a `test` script**

In `package.json`, add the `test` script to the `scripts` block and `croner` to `dependencies`:

```json
{
  "name": "pollius-world",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "description": "Pollius — agentic civilization engine. Bare design: the Hermes heartbeat cycle.",
  "scripts": {
    "dev": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test src/scheduler.test.ts",
    "beat": "tsx src/index.ts"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@anthropic-ai/sdk": "^0.40.0",
    "@mysten/sui": "^1.30.0",
    "croner": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: completes successfully; `croner` appears under `node_modules/`.

- [ ] **Step 3: (Optional) Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add croner dependency and test script"
```

---

## Task 2: Reduce `Heartbeat` to a single public `beat()`

**Files:**
- Modify: `src/heartbeat.ts`

The current `Heartbeat` owns the loop (`run()` + `sleep`). The scheduler now owns timing, so `Heartbeat` should expose one public `beat()` that runs exactly one pulse and tracks its own cycle number for logging.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/heartbeat.ts` with:

```ts
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
```

- [ ] **Step 2: Verify typecheck fails on `index.ts` only**

Run: `pnpm typecheck`
Expected: FAIL — `src/index.ts` still calls `heartbeat.run()`, which no longer exists (`Property 'run' does not exist on type 'Heartbeat'`). `src/heartbeat.ts` itself has no errors. This failure is expected and is fixed in Task 5.

- [ ] **Step 3: (Optional) Commit**

```bash
git add src/heartbeat.ts
git commit -m "refactor: reduce Heartbeat to a single public beat()"
```

---

## Task 3: Build the `Scheduler` (TDD)

**Files:**
- Create: `src/scheduler.test.ts`
- Create: `src/scheduler.ts`

The scheduler runs beats on a cron schedule. Overlap policy: if a tick arrives while a beat is in flight, set a single `pending` flag (coalesced — multiple missed ticks still produce just one catch-up beat). After `maxCycles` completed beats (0 = forever) it stops. A beat that throws is caught and logged so the scheduler survives. Tests drive `tick()` directly with a controllable `onBeat`, so they need no real timers.

- [ ] **Step 1: Write the failing tests**

Create `src/scheduler.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { Scheduler } from "./scheduler.js"; // .js — NodeNext requires it; tsx maps to .ts

/** A promise plus its resolver, for gating an async onBeat from the test. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Let queued microtasks/immediates drain so the scheduler can advance. */
const flush = () => new Promise((r) => setImmediate(r));

test("runs one beat per tick and never concurrently", async () => {
  let active = 0;
  let maxConcurrent = 0;
  let calls = 0;
  const gates: ReturnType<typeof deferred>[] = [];

  const onBeat = async () => {
    calls += 1;
    active += 1;
    maxConcurrent = Math.max(maxConcurrent, active);
    const g = deferred();
    gates.push(g);
    await g.promise;
    active -= 1;
  };

  const s = new Scheduler({ cron: "* * * * * *", maxCycles: 0, runOnStart: false, onBeat });

  const first = s.tick(); // beat #1 starts, blocks on gates[0]
  void s.tick(); // running → coalesced (pending = true)
  void s.tick(); // running → still just pending
  await flush();
  assert.equal(calls, 1, "only one beat runs while the first is in flight");

  gates[0]!.resolve(); // finish beat #1 → one coalesced catch-up beat #2
  await flush();
  assert.equal(calls, 2, "exactly one catch-up beat runs, not three");

  gates[1]!.resolve(); // finish beat #2 → nothing pending → loop ends
  await first;
  assert.equal(calls, 2);
  assert.equal(maxConcurrent, 1, "beats never overlap");

  s.stop();
});

test("stops after maxCycles beats", async () => {
  let calls = 0;
  const onBeat = async () => {
    calls += 1;
  };
  const s = new Scheduler({ cron: "* * * * * *", maxCycles: 2, runOnStart: false, onBeat });

  await s.tick(); // beat #1
  await s.tick(); // beat #2 → reaches limit, stops
  await s.tick(); // stopped → no-op

  assert.equal(calls, 2);
});

test("survives a beat that throws", async () => {
  let calls = 0;
  const onBeat = async () => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
  };
  const s = new Scheduler({ cron: "* * * * * *", maxCycles: 2, runOnStart: false, onBeat });

  await s.tick(); // throws internally; caught and counted
  await s.tick(); // second beat still runs → reaches limit

  assert.equal(calls, 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — module `./scheduler.ts` does not exist (`Cannot find module`).

- [ ] **Step 3: Write the scheduler implementation**

Create `src/scheduler.ts`:

```ts
// The Scheduler — wakes the agent on a cron schedule.
//
// Owns a `croner` cron job and is the sole decider of WHEN beats fire. Overlap
// policy: if a tick arrives while a beat is in flight, a single `pending` beat is
// queued (coalesced — multiple missed ticks still yield just one catch-up). After
// `maxCycles` completed beats (0 = forever) the cron stops and `run()` resolves.
import { Cron } from "croner";

export interface SchedulerDeps {
  /** Cron expression, e.g. "*\/5 * * * *" (every 5 minutes). */
  cron: string;
  /** Stop after this many completed beats. 0 = run forever. */
  maxCycles: number;
  /** Fire one beat immediately on start, before the first scheduled tick. */
  runOnStart: boolean;
  /** Run exactly one beat. */
  onBeat: () => Promise<void>;
}

export class Scheduler {
  private job?: Cron;
  private running = false;
  private pending = false;
  private completed = 0;
  private stopped = false;
  private finished = false;
  private done?: () => void;

  constructor(private readonly d: SchedulerDeps) {}

  /** Start the scheduler. Resolves when maxCycles is reached or after stop(). */
  run(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.done = resolve;
      this.job = new Cron(this.d.cron, () => void this.tick());
      if (this.d.runOnStart) void this.tick();
    });
  }

  /** Stop scheduling new beats. An in-flight beat is allowed to finish. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.job?.stop();
    if (!this.running) this.finish();
  }

  /** A scheduled (or run-on-start) tick. Public so tests can drive it directly. */
  async tick(): Promise<void> {
    if (this.stopped) return;
    if (this.running) {
      this.pending = true; // coalesced: at most one queued beat
      return;
    }
    this.running = true;
    try {
      await this.runBeatLoop();
    } finally {
      this.running = false;
    }
  }

  /** Run one beat, then drain a single coalesced pending beat if one arrived. */
  private async runBeatLoop(): Promise<void> {
    do {
      this.pending = false;
      await this.safeBeat();
      this.completed += 1;
      if (this.reachedLimit() || this.stopped) {
        this.finish();
        return;
      }
    } while (this.pending);
  }

  /** Run onBeat; swallow + log errors so the scheduler survives a bad beat. */
  private async safeBeat(): Promise<void> {
    try {
      await this.d.onBeat();
    } catch (err) {
      console.error("[scheduler] beat failed:", err);
    }
  }

  private reachedLimit(): boolean {
    return this.d.maxCycles !== 0 && this.completed >= this.d.maxCycles;
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.stopped = true;
    this.job?.stop();
    this.done?.();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all three tests green. (The "survives a beat that throws" test prints `[scheduler] beat failed: Error: boom` to stderr; that is expected and the test still passes.)

- [ ] **Step 5: Verify typecheck (scheduler is clean; index still pending)**

Run: `pnpm typecheck`
Expected: FAIL on `src/index.ts` only (still calls `heartbeat.run()`). `src/scheduler.ts` and `src/scheduler.test.ts` produce no errors. Fixed in Task 5.

- [ ] **Step 6: (Optional) Commit**

```bash
git add src/scheduler.ts src/scheduler.test.ts
git commit -m "feat: add cron-driven Scheduler with coalesced overlap and maxCycles stop"
```

---

## Task 4: Update `Config` — cron + runOnStart, drop cooldownS

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/config.ts` with:

```ts
// Central configuration, read once from the environment at startup.
import { resolve } from "node:path";

export type SuiNetwork = "testnet" | "devnet" | "localnet" | "mainnet";

/** Weights for the weighted-mean aggregation. Keyed by dimension; must sum to 1. */
export interface Weights {
  correctness: number;
  security: number;
  novelty: number;
  mythos: number;
}

export interface Config {
  anthropicApiKey: string;
  suiNetwork: SuiNetwork;
  keypairFile: string;
  workdir: string;
  /** Cron expression that drives the heartbeat, e.g. "* * * * *" (every minute). */
  cron: string;
  /** Fire one beat immediately on start, before the first scheduled tick. */
  runOnStart: boolean;
  /** Stop after this many completed beats. 0 = run forever. */
  maxCycles: number;
  weights: Weights;
}

/** Read a required env var or throw — fail fast on misconfiguration. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function loadConfig(): Config {
  return {
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
    suiNetwork: (process.env.SUI_NETWORK ?? "testnet") as SuiNetwork,
    keypairFile: resolve(process.env.HERMES_KEYPAIR_FILE ?? "./.secrets/hermes.key"),
    workdir: resolve(process.env.HERMES_WORKDIR ?? "./.workdir"),
    cron: process.env.HEARTBEAT_CRON ?? "* * * * *",
    runOnStart: (process.env.HEARTBEAT_RUN_ON_START ?? "true") !== "false",
    maxCycles: Number(process.env.HEARTBEAT_MAX_CYCLES ?? "1"),
    // 0.40 / 0.20 / 0.20 / 0.20 — Correctness leads (it has ground truth).
    weights: { correctness: 0.4, security: 0.2, novelty: 0.2, mythos: 0.2 },
  };
}
```

- [ ] **Step 2: Verify typecheck (still only index.ts fails)**

Run: `pnpm typecheck`
Expected: FAIL on `src/index.ts` only. `src/config.ts` is clean. (`src/heartbeat.ts` reads only `cfg.workdir`, so dropping `cooldownS` does not affect it.)

- [ ] **Step 3: (Optional) Commit**

```bash
git add src/config.ts
git commit -m "feat: config uses HEARTBEAT_CRON + HEARTBEAT_RUN_ON_START, drops cooldown"
```

---

## Task 5: Wire the Scheduler in `index.ts` + signal handlers; update `.env.example`

**Files:**
- Modify: `src/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Replace `src/index.ts` contents**

Replace the entire contents of `src/index.ts` with:

```ts
// Pollius — bare cycle entrypoint. Wires the components and starts the scheduler.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { HermesRegistry } from "./hermes/registry.js";
import { HermesAgent } from "./agent/hermesAgent.js";
import { Executor, loadKeypair } from "./executor/executor.js";
import { EvaluatorSwarm } from "./evaluators/index.js";
import { NoopStorage } from "./storage/storage.js";
import { Heartbeat } from "./heartbeat.js";
import { Scheduler } from "./scheduler.js";

async function main(): Promise<void> {
  const cfg = loadConfig();

  // Identity: the keypair from file. Only the executor ever sees it.
  const keypair = await loadKeypair(cfg.keypairFile);
  const executor = new Executor(keypair, cfg.suiNetwork);
  console.log(`Hermes identity (address): ${executor.address}`);
  console.log(`Network: ${cfg.suiNetwork}`);
  console.log(
    `Schedule: ${cfg.cron}  (run-on-start: ${cfg.runOnStart}, max cycles: ${cfg.maxCycles || "∞"})`,
  );

  const mythos = await readFile(resolve("miso.md"), "utf8");

  const heartbeat = new Heartbeat({
    cfg,
    registry: new HermesRegistry(),
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
```

- [ ] **Step 2: Update `.env.example`**

In `.env.example`, replace the cooldown/cycles block (the lines from `# Seconds the heartbeat sleeps...` through `HEARTBEAT_MAX_CYCLES=1`) with:

```
# Cron expression that drives the heartbeat (5-field: min hour dom mon dow).
# Examples: "* * * * *" every minute · "*/5 * * * *" every 5 min · "0 * * * *" hourly.
HEARTBEAT_CRON=* * * * *

# Fire one beat immediately on start, before waiting for the first cron tick.
# Set to "false" to wait for the first scheduled time instead.
HEARTBEAT_RUN_ON_START=true

# How many beats to run before exiting. 0 = run forever.
HEARTBEAT_MAX_CYCLES=1
```

- [ ] **Step 3: Verify the full typecheck passes**

Run: `pnpm typecheck`
Expected: PASS — no output, exit 0.

- [ ] **Step 4: Verify tests still pass**

Run: `pnpm test`
Expected: PASS — all scheduler tests green.

- [ ] **Step 5: Smoke-test the wiring (no real run required)**

Run: `node --import tsx -e "import('./src/scheduler.js').then(m => { const s = new m.Scheduler({ cron: '*/5 * * * *', maxCycles: 2, runOnStart: true, onBeat: async () => console.log('beat'); }); return s.run(); }).then(() => console.log('done'))"`
Expected: prints `beat` twice (run-on-start beat + one immediate catch-up since the synchronous `onBeat` lets the loop see no pending — so realistically prints `beat` once, then the process stays alive until the next cron tick ~5 min). For a fast deterministic smoke instead, run: `node --import tsx --test src/scheduler.test.ts` and confirm green. (The unit tests are the authoritative check; a live `pnpm beat` needs `ANTHROPIC_API_KEY` + a funded key and is out of scope for this smoke.)

- [ ] **Step 6: (Optional) Commit**

```bash
git add src/index.ts .env.example
git commit -m "feat: drive heartbeat via cron Scheduler with graceful shutdown"
```

---

## Task 6: Add a placeholder "read" skill to the Hermes registry

**Files:**
- Modify: `src/hermes/registry.ts`

The Hermes agent should *have* a "read" skill — a capability to read/inspect prior context before inventing. Per scope, the functionality is **null for now**: this task scaffolds the skill with an empty prompt and a clearly-marked section showing where the read behavior will be implemented. The bare cycle still pulls the invent skill, so beat behavior is unchanged.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/hermes/registry.ts` with:

```ts
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS — no output, exit 0. (`READ_PRIOR_WORK` is `export`ed, so it is not flagged as unused.)

- [ ] **Step 3: (Optional) Commit**

```bash
git add src/hermes/registry.ts
git commit -m "feat: scaffold placeholder read-prior-work skill (functionality TBD)"
```

---

## Self-Review

**Spec coverage:**
- Resident process + internal scheduler → Task 3 (`Scheduler.run()` owns a `croner` job). ✓
- Cron schedule via `HEARTBEAT_CRON` → Task 4 config + Task 5 wiring. ✓
- Overlap = queue + coalesce to one → Task 3 `runBeatLoop` (`pending` flag, do/while). ✓ + tested.
- `maxCycles` preserved (0 = forever, default 1) → Task 4 config + Task 3 `reachedLimit`. ✓ + tested.
- `runOnStart` (default true) → Task 4 config + Task 3 `run()`. ✓
- Beat errors don't kill the scheduler → Task 3 `safeBeat`. ✓ + tested.
- Graceful SIGINT/SIGTERM → Task 5 signal handlers + `stop()`. ✓
- `croner` dependency → Task 1. ✓
- `.env.example` swap → Task 5. ✓
- Heartbeat reduced to `beat()` → Task 2. ✓
- Wake every one minute (default cron `* * * * *`) → Task 4 config + Task 5 `.env.example`. ✓
- Placeholder "read" skill, functionality null + marked section → Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `Scheduler` / `SchedulerDeps` field names (`cron`, `maxCycles`, `runOnStart`, `onBeat`) match between `scheduler.ts`, the tests, and the `index.ts` construction. `Config.cron` / `Config.runOnStart` / `Config.maxCycles` match their consumers. `Heartbeat.beat()` (no args) matches the `onBeat: () => heartbeat.beat()` call. ✓
