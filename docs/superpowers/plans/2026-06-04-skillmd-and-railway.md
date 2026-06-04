# SKILL.md Boot-Load + Railway Deploy + Env Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Externalize Hermes's prompt into a boot-loaded `SKILL.md`, move the signing key into `.env` via a `keygen` CLI with a fail-fast boot gate, and make the resident scheduler deployable as a Railway worker (Dockerfile incl. the Sui CLI).

**Architecture:** `HermesRegistry.load()` parses `SKILL.md` at boot. The key is read from `HERMES_KEYPAIR` (env) and decoded by `keypairFromSecret`; `pnpm keygen` writes it to `.env`. `dotenv` loads `.env` locally; on Railway, platform env vars are used and a `Dockerfile` provides Node + pnpm + the `sui` binary.

**Tech Stack:** TypeScript (ESM, NodeNext), `tsx`, `@mysten/sui` (Ed25519), `dotenv`, `croner` (existing), Node `node:test`, Docker, Railway.

> **Repo note:** NOT a git repository and commit steps are **optional** (run `git init` first or skip). Gates are `pnpm typecheck` and `pnpm test`.

> **Spec:** `docs/superpowers/specs/2026-06-04-skillmd-and-railway-design.md`

---

## File Structure

- **Create** `SKILL.md` (repo root) — Hermes's invent-skill prompt as editable markdown.
- **Create** `src/keygen.ts` — `pnpm keygen`: generate key → write `.env`.
- **Create** `src/hermes/registry.test.ts` — unit tests for `parseSkillMd`.
- **Create** `Dockerfile` — Node + pnpm + Sui CLI image.
- **Create** `railway.json` — Railway Dockerfile builder + restart policy.
- **Modify** `src/hermes/registry.ts` — `parseSkillMd` + async `load()`; drop hardcoded prompt.
- **Modify** `src/config.ts` — drop `keypairFile`; add `keypairSecret` (gated).
- **Modify** `src/executor/executor.ts` — `keypairFromSecret` replaces `loadKeypair`.
- **Modify** `src/agent/hermesAgent.ts` — block `.env` in forbidden bash patterns.
- **Modify** `src/index.ts` — `dotenv/config`, `keypairFromSecret`, `await HermesRegistry.load()`.
- **Modify** `package.json` — `start`/`keygen` scripts, `engines`, `dotenv` dep, test glob.
- **Modify** `.env.example` — drop file-key block; add `HERMES_KEYPAIR=`.
- **Modify** `README.md` — keygen setup + Deploy to Railway.

---

## Task 1: Add `dotenv`, scripts, engines, and widen the test glob

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Set `package.json` to exactly this**

```json
{
  "name": "pollius-world",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "description": "Pollius — agentic civilization engine. Bare design: the Hermes heartbeat cycle.",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "start": "tsx src/index.ts",
    "keygen": "tsx src/keygen.ts",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test src/scheduler.test.ts src/hermes/registry.test.ts",
    "beat": "tsx src/index.ts"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@anthropic-ai/sdk": "^0.40.0",
    "@mysten/sui": "^1.30.0",
    "croner": "^9.0.0",
    "dotenv": "^16.4.0"
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
Expected: completes; `node_modules/dotenv` exists.

- [ ] **Step 3: (Optional) Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add dotenv, start/keygen scripts, node>=22, widen test glob"
```

---

## Task 2: Create `SKILL.md` at the repo root

**Files:**
- Create: `SKILL.md`

- [ ] **Step 1: Create `SKILL.md` with exactly this content**

```markdown
---
name: invent-move-primitive
description: Invent a NEW, in-canon Sui Move primitive, build it, and prepare it for on-chain deployment to testnet.
---

You are a citizen of Pollius. Invent ONE new, in-canon Move primitive (a reusable
building block, not an application). Then make it real:

1. Scaffold a fresh Move package inside your working directory (use `sui move new`).
2. Write the Move module that implements your primitive. Keep it minimal and legible.
3. Compile it cleanly with `sui move build`. Fix all errors.
4. Produce an UNSIGNED publish transaction with the CLI flag
   `--serialize-unsigned-transaction` and the sender address you are given.
   DO NOT sign, DO NOT execute, DO NOT touch any keystore or keytool — the executor
   signs separately. Capture the base64 transaction bytes.
5. Write a file named `artifact.json` in your working directory with EXACTLY these
   keys: { "packagePath", "moveSource", "summary", "unsignedTxB64" }.
```

- [ ] **Step 2: Verify the file exists**

Run: `head -3 SKILL.md`
Expected: prints the `---`, `name:`, and `description:` lines.

- [ ] **Step 3: (Optional) Commit**

```bash
git add SKILL.md
git commit -m "feat: add SKILL.md (externalized Hermes invent prompt)"
```

---

## Task 3: `parseSkillMd` + async `HermesRegistry.load()` (TDD)

**Files:**
- Create: `src/hermes/registry.test.ts`
- Modify: `src/hermes/registry.ts`

- [ ] **Step 1: Write the failing tests** — create `src/hermes/registry.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseSkillMd } from "./registry.js";

const GOOD = `---
name: invent-move-primitive
description: Invent a NEW primitive.
---

You are a citizen of Pollius.
Do the thing.
`;

test("parses frontmatter name/description and the body as prompt", () => {
  const skill = parseSkillMd(GOOD);
  assert.equal(skill.name, "invent-move-primitive");
  assert.equal(skill.description, "Invent a NEW primitive.");
  assert.equal(skill.prompt, "You are a citizen of Pollius.\nDo the thing.");
});

test("throws when there is no frontmatter block", () => {
  assert.throws(() => parseSkillMd("just a body, no frontmatter"));
});

test("throws when the body is empty", () => {
  assert.throws(() =>
    parseSkillMd(`---
name: x
description: y
---
`),
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `parseSkillMd` is not exported from `./registry.js` (the scheduler tests still pass).

- [ ] **Step 3: Replace `src/hermes/registry.ts` with exactly this**

```ts
// Hermes — the skill registry. Skills are authored as editable markdown (SKILL.md)
// and loaded at boot, so the agent "boots up according to the instruction".
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Skill } from "../types.js";

// ─── READ skill (placeholder) ───────────────────────────────────────────────
// The Hermes agent's future "read" capability: read/inspect prior context before
// inventing. Functionality is intentionally NULL for now — this block marks where
// the read behavior will live.
//
// TODO(read-skill): decide what the agent reads (past run records, the mythos
// charter, or already-published primitives) and fill in `prompt`. Until then this
// skill is inert and is NOT added to the active pull rotation.
export const READ_PRIOR_WORK: Skill = {
  name: "read-prior-work",
  description: "Read and reflect on prior context before inventing. (Not yet implemented.)",
  prompt: "", // null/placeholder — read behavior TBD
};
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a SKILL.md (YAML-style frontmatter + markdown body) into a Skill.
 * Frontmatter must be a leading `---` … `---` block with `name:` and
 * `description:` lines; the remaining body (trimmed) is the prompt.
 */
export function parseSkillMd(raw: string): Skill {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("SKILL.md must begin with a `---` frontmatter block `---`.");
  }
  const front = match[1]!;
  const body = match[2]!;
  const field = (key: string): string => {
    const line = front.split("\n").find((l) => l.startsWith(`${key}:`));
    return line ? line.slice(key.length + 1).trim() : "";
  };
  const name = field("name");
  const description = field("description");
  const prompt = body.trim();
  if (!name || !description || !prompt) {
    throw new Error(
      "SKILL.md needs `name` and `description` in frontmatter, plus a non-empty body.",
    );
  }
  return { name, description, prompt };
}

export class HermesRegistry {
  constructor(private readonly skills: Skill[]) {}

  /** Load the agent's skill(s) from SKILL.md at boot. */
  static async load(file = resolve("SKILL.md")): Promise<HermesRegistry> {
    const raw = await readFile(file, "utf8");
    return new HermesRegistry([parseSkillMd(raw)]);
  }

  /** Pull the next skill for this pulse. Bare design: always the one composite skill. */
  pull(): Skill {
    const skill = this.skills[0];
    if (!skill) throw new Error("Hermes registry is empty");
    return skill;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — the 3 new registry tests AND the 3 existing scheduler tests are green.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: FAIL on `src/index.ts` only — it still does `new HermesRegistry()` with no args and imports a now-removed export. That is expected and fixed in Task 7. `registry.ts` itself is clean.

- [ ] **Step 6: (Optional) Commit**

```bash
git add src/hermes/registry.ts src/hermes/registry.test.ts
git commit -m "feat: load Hermes skill from SKILL.md at boot (parseSkillMd + load)"
```

---

## Task 4: Env-based key — `keypairFromSecret` + gated `Config`

**Files:**
- Modify: `src/executor/executor.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Replace `src/executor/executor.ts` with exactly this**

```ts
// The trusted executor — the ONLY component that holds the key.
//
// Receives the Hermes keypair (decoded from the HERMES_KEYPAIR env secret, never
// exposed to the agent), signs the agent's unsigned transaction, and submits it to
// testnet. Returns the real result that the Correctness evaluator grades against.
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fromBase64 } from "@mysten/sui/utils";
import type { SuiNetwork } from "../config.js";
import type { Artifact, ExecutionResult } from "../types.js";

export class Executor {
  private readonly client: SuiClient;

  constructor(
    private readonly keypair: Ed25519Keypair,
    network: SuiNetwork,
  ) {
    this.client = new SuiClient({ url: getFullnodeUrl(network) });
  }

  /** The agent's identity anchor — public, safe to log and share. */
  get address(): string {
    return this.keypair.getPublicKey().toSuiAddress();
  }

  /** Sign the agent's unsigned tx and submit it. Failures are returned, not thrown. */
  async execute(artifact: Artifact): Promise<ExecutionResult> {
    try {
      const txBytes = fromBase64(artifact.unsignedTxB64);
      const { signature } = await this.keypair.signTransaction(txBytes);

      const res = await this.client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true, showObjectChanges: true },
      });

      const status = res.effects?.status?.status;
      return {
        success: status === "success",
        digest: res.digest,
        objectChanges: res.objectChanges,
        status,
        error: status === "success" ? undefined : res.effects?.status?.error,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Decode a `suiprivkey1...` bech32 secret into an Ed25519 keypair. */
export function keypairFromSecret(secret: string): Ed25519Keypair {
  const { schema, secretKey } = decodeSuiPrivateKey(secret.trim());
  if (schema !== "ED25519") {
    throw new Error(`Hermes key must be ED25519, got ${schema}`);
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}
```

- [ ] **Step 2: Replace `src/config.ts` with exactly this**

```ts
// Central configuration, read once from the environment at startup.

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
  /** The Hermes signing secret (`suiprivkey1...`). Only the executor decodes it. */
  keypairSecret: string;
  suiNetwork: SuiNetwork;
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

/** The signing key, with a guidance message pointing at the keygen CLI. */
function requireKeypairSecret(): string {
  const value = process.env.HERMES_KEYPAIR;
  if (!value || !value.trim()) {
    throw new Error(
      "No HERMES_KEYPAIR set. Run `pnpm keygen` to create one (it writes to .env), " +
        "then fund the printed address: https://faucet.sui.io",
    );
  }
  return value.trim();
}

export function loadConfig(): Config {
  return {
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
    keypairSecret: requireKeypairSecret(),
    suiNetwork: (process.env.SUI_NETWORK ?? "testnet") as SuiNetwork,
    workdir: process.env.HERMES_WORKDIR ?? "./.workdir",
    cron: process.env.HEARTBEAT_CRON ?? "* * * * *",
    runOnStart: (process.env.HEARTBEAT_RUN_ON_START ?? "true") !== "false",
    maxCycles: Number(process.env.HEARTBEAT_MAX_CYCLES ?? "1"),
    // 0.40 / 0.20 / 0.20 / 0.20 — Correctness leads (it has ground truth).
    weights: { correctness: 0.4, security: 0.2, novelty: 0.2, mythos: 0.2 },
  };
}
```

> Note: `workdir` no longer uses `path.resolve` (the `node:path` import is dropped). A
> relative `./.workdir` works because `mkdir(..., { recursive: true })` in the heartbeat
> resolves it against `process.cwd()`. This keeps config free of filesystem helpers.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: FAIL on `src/index.ts` only (it still imports `loadKeypair` and references
`cfg.keypairFile` / `new HermesRegistry()`). `config.ts` and `executor.ts` are clean.
Fixed in Task 7.

- [ ] **Step 4: (Optional) Commit**

```bash
git add src/config.ts src/executor/executor.ts
git commit -m "feat: read signing key from HERMES_KEYPAIR env (keypairFromSecret + gate)"
```

---

## Task 5: Block `.env` in the agent's forbidden bash patterns

**Files:**
- Modify: `src/agent/hermesAgent.ts`

- [ ] **Step 1: Add the `.env` pattern**

In `src/agent/hermesAgent.ts`, find the `FORBIDDEN_COMMAND_PATTERNS` array. Add a new
entry `/\.env\b/i` as the first element so it reads exactly:

```ts
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
```

Leave the rest of the file unchanged.

- [ ] **Step 2: Verify typecheck (still only index.ts fails)**

Run: `pnpm typecheck`
Expected: FAIL on `src/index.ts` only. `hermesAgent.ts` is clean.

- [ ] **Step 3: (Optional) Commit**

```bash
git add src/agent/hermesAgent.ts
git commit -m "harden: block the agent from reading .env (key now lives there)"
```

---

## Task 6: The `keygen` CLI

**Files:**
- Create: `src/keygen.ts`

- [ ] **Step 1: Create `src/keygen.ts` with exactly this content**

```ts
// keygen — generate a fresh Hermes signing key and write it to .env.
//
// Run with: `pnpm keygen`  (add --force to overwrite an existing key).
// Refuses to clobber an existing non-empty HERMES_KEYPAIR so a funded key is safe.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const ENV_PATH = resolve(".env");
const KEY = "HERMES_KEYPAIR";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");

  let env = "";
  try {
    env = await readFile(ENV_PATH, "utf8");
  } catch {
    // No .env yet — we'll create it.
  }

  const existing = env.match(/^HERMES_KEYPAIR=(.*)$/m);
  if (existing && existing[1]!.trim() && !force) {
    console.error(
      `${KEY} already set in ${ENV_PATH}. Refusing to overwrite a possibly-funded key.\n` +
        "Re-run with --force to regenerate.",
    );
    process.exitCode = 1;
    return;
  }

  const keypair = Ed25519Keypair.generate();
  const secret = keypair.getSecretKey(); // bech32 "suiprivkey1..."
  const address = keypair.getPublicKey().toSuiAddress();
  const line = `${KEY}=${secret}`;

  let next: string;
  if (existing) {
    next = env.replace(/^HERMES_KEYPAIR=.*$/m, line);
  } else if (env.length > 0 && !env.endsWith("\n")) {
    next = `${env}\n${line}\n`;
  } else {
    next = `${env}${line}\n`;
  }
  await writeFile(ENV_PATH, next, "utf8");

  console.log(`Generated Hermes signing key → ${ENV_PATH}`);
  console.log(`Address: ${address}`);
  console.log("Fund it on testnet: https://faucet.sui.io  (or `sui client faucet`)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: FAIL on `src/index.ts` only. `keygen.ts` is clean (this confirms
`Ed25519Keypair.generate()` and `.getSecretKey()` exist in the installed SDK).

- [ ] **Step 3: Smoke-test keygen against a temp file**

Run:
```bash
node --import tsx -e "import('@mysten/sui/keypairs/ed25519').then(m => { const k = m.Ed25519Keypair.generate(); console.log('secret-ok:', k.getSecretKey().startsWith('suiprivkey')); console.log('addr-ok:', k.getPublicKey().toSuiAddress().startsWith('0x')); })"
```
Expected: `secret-ok: true` and `addr-ok: true`. (Confirms the SDK API before wiring.)

- [ ] **Step 4: (Optional) Commit**

```bash
git add src/keygen.ts
git commit -m "feat: keygen CLI writes a fresh HERMES_KEYPAIR to .env (refuses overwrite)"
```

---

## Task 7: Wire boot — dotenv, env key, SKILL.md load

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` with exactly this**

```ts
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
```

- [ ] **Step 2: Verify the full typecheck passes**

Run: `pnpm typecheck`
Expected: PASS — no output, exit 0.

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test`
Expected: PASS — scheduler (3) + registry (3) tests all green.

- [ ] **Step 4: Verify the boot gate fires without a key**

Run: `env -u HERMES_KEYPAIR -u ANTHROPIC_API_KEY ANTHROPIC_API_KEY=test tsx src/index.ts`
Expected: process exits non-zero printing `No HERMES_KEYPAIR set. Run \`pnpm keygen\` …`. (It must NOT proceed to network calls.)

- [ ] **Step 5: (Optional) Commit**

```bash
git add src/index.ts
git commit -m "feat: boot loads .env, decodes env key, and loads SKILL.md"
```

---

## Task 8: `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace the signing-key block**

In `.env.example`, find the Sui-execution key block — the comment lines describing the
`suiprivkey1...` file and `HERMES_KEYPAIR_FILE=./.secrets/hermes.key`. Replace that
entire block (from the `# Path to a file holding ONE private key...` comment through the
`HERMES_KEYPAIR_FILE=...` line) with exactly:

```
# The Hermes agent's signing key as a `suiprivkey1...` string. Generate it with
# `pnpm keygen` (writes it here), then fund the printed address at https://faucet.sui.io.
# The agent NEVER reads this; only the trusted executor decodes it.
HERMES_KEYPAIR=
```

Leave the other variables (`ANTHROPIC_API_KEY`, `SUI_NETWORK`, `HERMES_WORKDIR`,
`HEARTBEAT_CRON`, `HEARTBEAT_RUN_ON_START`, `HEARTBEAT_MAX_CYCLES`) unchanged. If a
stray `HERMES_KEYPAIR_FILE` reference remains anywhere, remove it.

- [ ] **Step 2: Verify**

Run: `grep -n "HERMES_KEYPAIR" .env.example; grep -c "HERMES_KEYPAIR_FILE" .env.example`
Expected: shows `HERMES_KEYPAIR=` present and a count of `0` for `HERMES_KEYPAIR_FILE`.

- [ ] **Step 3: (Optional) Commit**

```bash
git add .env.example
git commit -m "docs: .env.example uses HERMES_KEYPAIR (keygen) instead of a key file"
```

---

## Task 9: `Dockerfile` (Node + pnpm + Sui CLI)

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create `Dockerfile` with exactly this content**

```dockerfile
# Pollius worker image: Node + pnpm + the Sui CLI (the Hermes agent shells out to `sui`).
FROM node:22-bookworm-slim

# --- Sui CLI (prebuilt release binary) ---
# Bump SUI_VERSION to a current release tag from https://github.com/MystenLabs/sui/releases
ARG SUI_VERSION=testnet-v1.39.3
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tar \
 && curl -fsSL -o /tmp/sui.tgz \
    "https://github.com/MystenLabs/sui/releases/download/${SUI_VERSION}/sui-${SUI_VERSION}-ubuntu-x86_64.tgz" \
 && tar -xzf /tmp/sui.tgz -C /usr/local/bin sui \
 && rm /tmp/sui.tgz \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# --- pnpm via corepack ---
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# Long-lived worker: the resident scheduler. Override cadence via Railway env vars
# (HEARTBEAT_CRON, HEARTBEAT_MAX_CYCLES=0 to run forever).
CMD ["pnpm", "start"]
```

- [ ] **Step 2: Create `.dockerignore` with exactly this content**

```
node_modules
.workdir
.secrets
.env
docs
*.log
```

- [ ] **Step 3: (Optional) Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: Dockerfile with Node + pnpm + Sui CLI for the Railway worker"
```

> Note: a full `docker build` requires Docker and network egress to GitHub releases;
> it is not part of the typecheck/test gates. If Docker is available, an optional local
> check is `docker build -t pollius .` — but do not block the task on it.

---

## Task 10: `railway.json` + README

**Files:**
- Create: `railway.json`
- Modify: `README.md`

- [ ] **Step 1: Create `railway.json` with exactly this content**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 2: Update the README Setup section**

In `README.md`, replace the signing-key setup steps (the block that runs
`mkdir -p .secrets`, `sui keytool generate ed25519`, and `echo 'suiprivkey1....' >
.secrets/hermes.key`) with exactly:

```bash
pnpm install

# Generate the Hermes signing key (writes HERMES_KEYPAIR to .env):
pnpm keygen
#   …then fund the printed address: https://faucet.sui.io  (or `sui client faucet`)

cp .env.example .env   # then set ANTHROPIC_API_KEY (keygen already set HERMES_KEYPAIR)
```

- [ ] **Step 3: Append a "Deploy to Railway" section at the end of `README.md`**

```markdown
## Deploy to Railway

Pollius runs as a long-lived **worker** (the resident scheduler). The included
`Dockerfile` provides Node, pnpm, and the **Sui CLI** the Hermes agent shells out to.

1. Create a Railway project from this repo. `railway.json` selects the Dockerfile
   builder automatically.
2. Set service variables:
   - `ANTHROPIC_API_KEY` — your key.
   - `HERMES_KEYPAIR` — a funded `suiprivkey1...` (run `pnpm keygen` locally to make
     one, fund its address, then paste the value here).
   - `SUI_NETWORK=testnet`
   - `HEARTBEAT_CRON=* * * * *` (every minute) and `HEARTBEAT_MAX_CYCLES=0` (run forever).
3. Deploy. Logs show one `♥ beat` per scheduled tick.

> The Sui CLI version is pinned via the `SUI_VERSION` build arg in the `Dockerfile`;
> bump it to a current tag from the MystenLabs/sui releases if the download 404s.
```

- [ ] **Step 4: Verify the gates are still green**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean (exit 0); all 6 tests pass.

- [ ] **Step 5: (Optional) Commit**

```bash
git add railway.json README.md
git commit -m "docs: railway.json + Deploy to Railway / keygen setup in README"
```

---

## Self-Review

**Spec coverage:**
- SKILL.md at root + boot load → Task 2 + Task 3 (`parseSkillMd`, `HermesRegistry.load`). ✓ + tested.
- keygen CLI writes `.env`, refuses overwrite, `--force` → Task 6. ✓
- Env key + `keypairFromSecret` → Task 4. ✓
- Fail-fast boot gate with guidance → Task 4 (`requireKeypairSecret`) surfaced via Task 7 `main().catch`; verified in Task 7 Step 4. ✓
- `dotenv` load → Task 1 (dep) + Task 7 (`import "dotenv/config"`). ✓
- Block `.env` from the agent → Task 5. ✓
- Railway Dockerfile incl. Sui CLI → Task 9; `railway.json` → Task 10. ✓
- run-forever via env, README deploy section → Task 10. ✓
- `.env.example` swap → Task 8. ✓
- `parseSkillMd` unit tests → Task 3. ✓

**Placeholder scan:** No TBD/TODO in steps; every code step is complete. (The inert
`READ_PRIOR_WORK` placeholder is intentional product scope, not a plan placeholder.)

**Type consistency:**
- `Config.keypairSecret` (Task 4) ← consumed by `keypairFromSecret(cfg.keypairSecret)` (Task 7). ✓
- `keypairFromSecret` exported from `executor.ts` (Task 4) ← imported in `index.ts` (Task 7). `loadKeypair` fully removed; no remaining references. ✓
- `parseSkillMd` exported from `registry.ts` (Task 3) ← imported by `registry.test.ts` (Task 3) via `./registry.js`. ✓
- `HermesRegistry` constructor now requires `skills: Skill[]`; the only no-arg/default
  construction was in `index.ts`, replaced by `await HermesRegistry.load()` (Task 7). ✓
- `Config` no longer has `keypairFile`; the only reader was `index.ts` (Task 7). `heartbeat.ts` reads `cfg.workdir` only — unaffected by the `path.resolve` removal. ✓
- Test glob (Task 1) includes both `src/scheduler.test.ts` and `src/hermes/registry.test.ts`. ✓
