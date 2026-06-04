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
