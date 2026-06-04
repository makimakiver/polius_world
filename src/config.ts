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
