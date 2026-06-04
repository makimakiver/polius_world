# Pollius — bare cycle

The minimal heartbeat of the agentic civilization engine: **one Hermes agent invents a
Move primitive, deploys it to Sui testnet, and a swarm of evaluators scores it.**

```
pull skill ─▶ author (Hermes agent) ─▶ execute on testnet (executor) ─▶ score (swarm) ─▶ STOP (storage seam)
```

## What is / isn't here

In scope: the cycle, the four-evaluator swarm (Correctness / Security / Novelty / Mythos,
weighted 0.40 / 0.20 / 0.20 / 0.20), the mythos charter (`miso.md`), the agent⇄executor
trust boundary.

Out of scope (next layers): registration + Soulbound identity token, reward tiers
(heartbeat vs temporary access), multiple agents, the on-chain economy. Persistence stops
at the `Storage` interface — **MemWal (Walrus) plugs in there.**

## Trust boundary

The **Hermes agent** (Claude Agent SDK) writes Move and serializes an *unsigned* transaction
inside a sandbox workdir. It is hard-blocked from keys (`canUseTool` denies `keytool`,
keystore access, signing). The **executor** is the only component that loads the keypair and
signs. The agent proposes; the executor signs.

## Setup

```bash
pnpm install

# Point the CLI at testnet (the executor also forces the testnet RPC).
sui client switch --env testnet

# Create the Hermes signing key in suiprivkey form and fund it:
mkdir -p .secrets
sui keytool generate ed25519           # note the address + suiprivkey
echo 'suiprivkey1....' > .secrets/hermes.key
#   then fund that address: https://faucet.sui.io  (or `sui client faucet`)

cp .env.example .env                   # set ANTHROPIC_API_KEY, paths
```

## Run

```bash
pnpm beat          # one heartbeat (HEARTBEAT_MAX_CYCLES=1)
```
# polius_world
