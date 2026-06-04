// The trusted executor — the ONLY component that holds the key.
//
// Receives the Hermes keypair (decoded from the HERMES_KEYPAIR env secret, never
// exposed to the agent), signs the agent's unsigned transaction, and submits it to
// testnet. Returns the real result that the Correctness evaluator grades against.
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fromBase64 } from "@mysten/sui/utils";
import type { SuiNetwork } from "../config.js";
import type { Artifact, ExecutionResult } from "../types.js";

export class Executor {
  private readonly client: SuiClient;

  constructor(
    private readonly keypair: Ed25519Keypair,
    network: SuiNetwork,
  ) {
    this.client = new SuiClient({ url: getFullnodeUrl(network) });
  }

  /** The agent's identity anchor — public, safe to log and share. */
  get address(): string {
    return this.keypair.getPublicKey().toSuiAddress();
  }

  /** Sign the agent's unsigned tx and submit it. Failures are returned, not thrown. */
  async execute(artifact: Artifact): Promise<ExecutionResult> {
    try {
      const txBytes = fromBase64(artifact.unsignedTxB64);
      const { signature } = await this.keypair.signTransaction(txBytes);

      const res = await this.client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true, showObjectChanges: true },
      });

      const status = res.effects?.status?.status;
      return {
        success: status === "success",
        digest: res.digest,
        objectChanges: res.objectChanges,
        status,
        error: status === "success" ? undefined : res.effects?.status?.error,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Decode a `suiprivkey1...` bech32 secret into an Ed25519 keypair. */
export function keypairFromSecret(secret: string): Ed25519Keypair {
  const { schema, secretKey } = decodeSuiPrivateKey(secret.trim());
  if (schema !== "ED25519") {
    throw new Error(`Hermes key must be ED25519, got ${schema}`);
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}
