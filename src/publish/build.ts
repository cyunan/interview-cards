import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { assertReportMatchesBaseline } from "../content/baseline";
import type { CardsPayloadV2 } from "../content/payload";
import { compileVault, type CompileReport } from "../content/vault";
import { encryptEnvelope, type EncryptedEnvelopeV1 } from "../crypto/envelope";

interface BuildEncryptedCardsInput {
  vaultRoot: string;
  outputPath: string;
  baseline: CompileReport;
  password: string;
  buildId: string;
  builtAt: string;
}

export interface EncryptedCardsBuild {
  envelope: EncryptedEnvelopeV1;
  report: CompileReport;
}

async function writeEnvelopeAtomically(
  outputPath: string,
  envelope: EncryptedEnvelopeV1,
): Promise<void> {
  const directory = path.dirname(outputPath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(envelope, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function buildEncryptedCards({
  vaultRoot,
  outputPath,
  baseline,
  password,
  buildId,
  builtAt,
}: BuildEncryptedCardsInput): Promise<EncryptedCardsBuild> {
  const compiled = await compileVault(vaultRoot);
  assertReportMatchesBaseline(compiled.report, baseline);
  const payload: CardsPayloadV2 = {
    schema: "cards-v2",
    buildId,
    builtAt,
    cards: compiled.cards,
  };
  const envelope = await encryptEnvelope(payload, password, buildId);
  await writeEnvelopeAtomically(outputPath, envelope);
  return { envelope, report: compiled.report };
}
