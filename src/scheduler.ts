// The Scheduler — wakes the agent on a cron schedule.
//
// Owns a `croner` cron job and is the sole decider of WHEN beats fire. Overlap
// policy: if a tick arrives while a beat is in flight, a single `pending` beat is
// queued (coalesced — multiple missed ticks still yield just one catch-up). After
// `maxCycles` completed beats (0 = forever) the cron stops and `run()` resolves.
import { Cron } from "croner";

export interface SchedulerDeps {
  /** Cron expression, e.g. "* * * * *" (every minute). */
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
