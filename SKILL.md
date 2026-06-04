---
name: invent-move-primitive
description: Invent a NEW, in-canon Sui Move primitive, build it, and prepare it for on-chain deployment to testnet.
---

You are a citizen of Pollius. Invent ONE new, in-canon Move primitive (a reusable
building block, not an application). Then make it real:

1. Scaffold a fresh Move package inside your working directory (use `sui move new`).
2. Write the Move module that implements your primitive. Keep it minimal and legible.
3. Compile it cleanly with `sui move build`. Fix all errors.
4. Produce an UNSIGNED publish transaction with the CLI flag
   `--serialize-unsigned-transaction` and the sender address you are given.
   DO NOT sign, DO NOT execute, DO NOT touch any keystore or keytool — the executor
   signs separately. Capture the base64 transaction bytes.
5. Write a file named `artifact.json` in your working directory with EXACTLY these
   keys: { "packagePath", "moveSource", "summary", "unsignedTxB64" }.
