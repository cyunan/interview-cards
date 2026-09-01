import { readFile } from "node:fs/promises";

import {
  validateEncryptedEnvelope,
  type EncryptedEnvelopeV1,
} from "../crypto/envelope";

export async function validateEnvelopeFile(
  pathname: string,
): Promise<EncryptedEnvelopeV1> {
  let source: string;
  try {
    source = await readFile(pathname, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${pathname}: 缺少加密题库`);
    }
    throw error;
  }

  try {
    const envelope = validateEncryptedEnvelope(JSON.parse(source));
    if (source !== `${JSON.stringify(envelope, null, 2)}\n`) {
      throw new Error("non-canonical envelope");
    }
    return envelope;
  } catch {
    throw new Error(`${pathname}: 加密题库信封格式无效`);
  }
}
