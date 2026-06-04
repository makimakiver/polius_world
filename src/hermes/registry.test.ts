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
