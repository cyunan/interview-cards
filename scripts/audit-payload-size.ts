import { randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

import { compileSite } from "../src/content/single-source";
import { encryptEnvelope } from "../src/crypto/envelope";
import { parseVaultArgument } from "../src/publish/args";

const MIB = 1024 * 1024;
const TARGET_BYTES = 14 * MIB;
const HARD_LIMIT_BYTES = 16 * MIB;

async function main(): Promise<void> {
  const vaultRoot = parseVaultArgument(process.argv.slice(2));
  const site = await compileSite(vaultRoot);
  const builtAt = new Date().toISOString();
  const buildId = `${builtAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const payload = { ...site.payload, buildId, builtAt };
  const temporaryPassword = randomBytes(32).toString("base64url");
  const envelope = await encryptEnvelope(payload, temporaryPassword, buildId);
  const envelopeBytes = Buffer.byteLength(`${JSON.stringify(envelope, null, 2)}\n`);
  const result = {
    schema: payload.schema,
    cards: payload.cards.length,
    documents: payload.documents?.length ?? 0,
    routes: payload.routes.length,
    performanceRouteCards: payload.routes.find((route) => route.id === "performance-diagnosis")
      ?.steps.reduce((count, step) => count + step.cardIds.length, 0) ?? 0,
    plaintextPayloadBytes: Buffer.byteLength(JSON.stringify(payload)),
    encryptedEnvelopeJsonBytes: envelopeBytes,
    encryptedEnvelopeMiB: Number((envelopeBytes / MIB).toFixed(2)),
    target14MiBBytes: TARGET_BYTES,
    targetPassed: envelopeBytes <= TARGET_BYTES,
    hardLimit16MiBBytes: HARD_LIMIT_BYTES,
    hardLimitPassed: envelopeBytes <= HARD_LIMIT_BYTES,
    outputWritten: false,
    passwordSource: "ephemeral random value held in process memory",
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.targetPassed || !result.hardLimitPassed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "载荷体积检查失败"}\n`);
  process.exitCode = 1;
});
