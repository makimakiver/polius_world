// Persistence seam — the bare design STOPS here.
//
// `MemWal` (Walrus-backed storage) will implement `Storage`. Until then this no-op
// surfaces the fully-formed RunRecord so you can see exactly what gets handed off.
import type { RunRecord, Storage } from "../types.js";

export class NoopStorage implements Storage {
  async store(record: RunRecord): Promise<void> {
    // --- MemWal seam: replace this body with a Walrus write. ---
    console.log(
      `[storage] STOP — handing run ${record.runId} to MemWal ` +
        `(final score ${record.finalScore.toFixed(1)}). Not persisted.`,
    );
  }
}
