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
