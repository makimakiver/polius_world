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

# Generate the Hermes signing key (writes HERMES_KEYPAIR to .env):
pnpm keygen
#   …then fund the printed address: https://faucet.sui.io  (or `sui client faucet`)

cp .env.example .env   # then set ANTHROPIC_API_KEY (keygen already set HERMES_KEYPAIR)
```

## Run

```bash
pnpm beat          # one heartbeat (HEARTBEAT_MAX_CYCLES=1)
```

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
