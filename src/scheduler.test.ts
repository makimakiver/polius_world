import test from "node:test";
import assert from "node:assert/strict";
import { Scheduler } from "./scheduler.js";

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
