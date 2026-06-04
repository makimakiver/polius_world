// keygen — generate a fresh Hermes signing key and write it to .env.
//
// Run with: `pnpm keygen`  (add --force to overwrite an existing key).
// Refuses to clobber an existing non-empty HERMES_KEYPAIR so a funded key is safe.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const ENV_PATH = resolve(".env");
const KEY = "HERMES_KEYPAIR";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");

  let env = "";
  try {
    env = await readFile(ENV_PATH, "utf8");
  } catch {
    // No .env yet — we'll create it.
  }

  const existing = env.match(/^HERMES_KEYPAIR=(.*)$/m);
  if (existing && existing[1]!.trim() && !force) {
    console.error(
      `${KEY} already set in ${ENV_PATH}. Refusing to overwrite a possibly-funded key.\n` +
        "Re-run with --force to regenerate.",
    );
    process.exitCode = 1;
    return;
  }

  const keypair = Ed25519Keypair.generate();
  const secret = keypair.getSecretKey(); // bech32 "suiprivkey1..."
  const address = keypair.getPublicKey().toSuiAddress();
  const line = `${KEY}=${secret}`;

  let next: string;
  if (existing) {
    next = env.replace(/^HERMES_KEYPAIR=.*$/m, line);
  } else if (env.length > 0 && !env.endsWith("\n")) {
    next = `${env}\n${line}\n`;
  } else {
    next = `${env}${line}\n`;
  }
  await writeFile(ENV_PATH, next, "utf8");

  console.log(`Generated Hermes signing key → ${ENV_PATH}`);
  console.log(`Address: ${address}`);
  console.log("Fund it on testnet: https://faucet.sui.io  (or `sui client faucet`)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
