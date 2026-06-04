# Scheduled wake-ups for the Pollius heartbeat

**Date:** 2026-06-04
**Status:** Approved (design)

## Problem

The current `Heartbeat.run()` drives cadence with an in-process `setTimeout` sleep
loop. This *simulates* a heartbeat: the runtime must stay alive holding the loop, and
the cadence is a sleep-between-beats, not a true schedule. We want a real scheduler
that wakes the agent at defined times.

## Decision summary

- **Wake model:** resident process + internal scheduler (replaces the sleep loop;
  still one long-lived process).
- **Schedule spec:** cron expression.
- **Overlap policy:** queue and run after — coalesced to a single pending beat.

## Architecture

A new `Scheduler` owns a [`croner`](https://github.com/Hexagon/croner) cron job and
decides *when* beats fire. `Heartbeat` becomes purely "run one beat": its `beat()`
method stays; its `run()` loop is removed. The pull → author → execute → score →
store pipeline and the agent⇄executor trust boundary are unchanged — only the cadence
mechanism changes.

```
Scheduler (cron) ──tick──▶ Heartbeat.beat()  ──▶ registry → agent → executor → swarm → storage
```

## New component — `src/scheduler.ts`

Constructed with `{ cron: string; maxCycles: number; onBeat: () => Promise<void> }`.

State:
- `running: boolean` — a beat is currently in flight.
- `pending: boolean` — a tick arrived during a beat (coalesced; at most one).
- `completed: number` — beats finished so far.

Behavior:
- **On tick:** if `running`, set `pending = true` and return. Else run a beat.
- **After a beat finishes:** increment `completed`. If `pending` was set, clear it and
  immediately run one catch-up beat. If `maxCycles !== 0 && completed >= maxCycles`,
  stop the cron and resolve `run()` so the process can exit.
- **Beat errors:** caught and logged via `console.error`; the scheduler survives and
  the next tick still fires. (Today a throw rejects `run()` and crashes the process —
  this is a deliberate improvement for a long-lived daemon.)

Public surface:
- `run(): Promise<void>` — start the scheduler; resolves when `maxCycles` is reached
  or on graceful shutdown.
- `stop(): void` — stop scheduling new beats (used by signal handlers).

## Config & env (`src/config.ts`, `.env.example`)

- **Replace** `cooldownS` with `cron: string` ← `HEARTBEAT_CRON`,
  default `"*/5 * * * *"` (every 5 minutes).
- **Keep** `maxCycles` ← `HEARTBEAT_MAX_CYCLES` unchanged (0 = forever; default 1).
- **Add** `runOnStart: boolean` ← `HEARTBEAT_RUN_ON_START`, default `true`.
- `.env.example`: drop `HEARTBEAT_COOLDOWN_S`, add `HEARTBEAT_CRON` and
  `HEARTBEAT_RUN_ON_START`.

## Startup behavior

When `runOnStart` is true, fire one beat immediately at process start, then let the
cron drive subsequent beats. Rationale: with the default `maxCycles=1` and a cron of
"every 5 min", waiting for the first scheduled tick would idle the single beat for up
to 5 minutes. Run-on-start preserves today's `pnpm beat` behavior: one immediate beat,
then exit (since `maxCycles=1` is already satisfied). The immediate beat counts toward
`maxCycles`.

## Shutdown

`SIGINT` / `SIGTERM`: call `scheduler.stop()` to stop scheduling new beats, let any
in-flight beat finish, then exit cleanly.

## Entrypoint (`src/index.ts`)

Construct the `Heartbeat` as today, then wrap it in a `Scheduler` built from
`cfg.cron`, `cfg.maxCycles`, and `onBeat: () => heartbeat.beat(...)`. Install signal
handlers. Await `scheduler.run()`.

> Note: `Heartbeat.beat()` is currently `private` and takes a `cycle: number` for
> logging. It becomes the scheduler's `onBeat` callback. Make it callable by the
> scheduler (e.g. a public `beat()` that derives/accepts the cycle number internally),
> keeping the per-beat logging.

## Dependency

Add `croner` (`^9`) to `dependencies` — tiny, zero-dep, TS-native; provides the cron
parsing, `.stop()`, and scheduling we need.

## Out of scope

- External/OS schedulers (cron, launchd, systemd) and stateless single-run mode.
- Persisting `completed` / schedule state across restarts.
- Backfilling more than one missed beat (queue is intentionally coalesced to one).

## Testing

- `pnpm typecheck` passes.
- `Scheduler` overlap logic is unit-testable in isolation by injecting a fast cron
  (e.g. every second) and an `onBeat` that resolves after a controllable delay, then
  asserting: no concurrent beats, a single coalesced catch-up, and `maxCycles` stop.
