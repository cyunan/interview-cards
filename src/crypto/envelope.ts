export interface EncryptedEnvelopeV1 {
  schema: "cards-envelope-v1";
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: 600000;
    salt: string;
  };
  cipher: {
    name: "AES-GCM";
    iv: string;
  };
  buildId: string;
  ciphertext: string;
}

const ITERATIONS = 600_000 as const;
const BUILD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class UnlockError extends Error {
  constructor() {
    super("解锁失败");
    this.name = "UnlockError";
  }
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function decodeCanonicalBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new UnlockError();
  }
  const bytes = fromBase64(value);
  if (toBase64(bytes) !== value) {
    throw new UnlockError();
  }
  return bytes;
}

function additionalData(buildId: string): Uint8Array {
  return encoder.encode(
    `cards-envelope-v1|${buildId}|PBKDF2|SHA-256|${ITERATIONS}|AES-GCM`,
  );
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    asBuffer(encoder.encode(password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: ITERATIONS,
      salt: asBuffer(salt),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function validateEncryptedEnvelope(value: unknown): EncryptedEnvelopeV1 {
  try {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, ["schema", "kdf", "cipher", "buildId", "ciphertext"]) ||
      value.schema !== "cards-envelope-v1" ||
      !isRecord(value.kdf) ||
      !hasExactKeys(value.kdf, ["name", "hash", "iterations", "salt"]) ||
      value.kdf.name !== "PBKDF2" ||
      value.kdf.hash !== "SHA-256" ||
      value.kdf.iterations !== ITERATIONS ||
      !isRecord(value.cipher) ||
      !hasExactKeys(value.cipher, ["name", "iv"]) ||
      value.cipher.name !== "AES-GCM" ||
      typeof value.buildId !== "string" ||
      !BUILD_ID_PATTERN.test(value.buildId)
    ) {
      throw new UnlockError();
    }

    const salt = decodeCanonicalBase64(value.kdf.salt);
    const iv = decodeCanonicalBase64(value.cipher.iv);
    const ciphertext = decodeCanonicalBase64(value.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
      throw new UnlockError();
    }

    return value as unknown as EncryptedEnvelopeV1;
  } catch {
    throw new UnlockError();
  }
}

function parseEnvelope(value: unknown): {
  envelope: EncryptedEnvelopeV1;
  salt: Uint8Array;
  iv: Uint8Array;
  ciphertext: Uint8Array;
} {
  const envelope = validateEncryptedEnvelope(value);
  return {
    envelope,
    salt: fromBase64(envelope.kdf.salt),
    iv: fromBase64(envelope.cipher.iv),
    ciphertext: fromBase64(envelope.ciphertext),
  };
}

export async function encryptEnvelope<T>(
  payload: T,
  password: string,
  buildId: string,
): Promise<EncryptedEnvelopeV1> {
  if (!BUILD_ID_PATTERN.test(buildId)) {
    throw new Error("buildId 格式非法");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asBuffer(iv),
      additionalData: asBuffer(additionalData(buildId)),
      tagLength: 128,
    },
    key,
    asBuffer(plaintext),
  );

  return {
    schema: "cards-envelope-v1",
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: ITERATIONS,
      salt: toBase64(salt),
    },
    cipher: { name: "AES-GCM", iv: toBase64(iv) },
    buildId,
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptEnvelope<T>(
  value: unknown,
  password: string,
): Promise<T> {
  try {
    return await decryptEnvelopeWithKey(value, await deriveEnvelopeKey(value, password));
  } catch {
    throw new UnlockError();
  }
}

/**
 * Derive the non-exportable content key for one encrypted publication.
 * The caller may keep the CryptoKey in IndexedDB to avoid persisting the
 * password itself.
 */
export async function deriveEnvelopeKey(
  value: unknown,
  password: string,
): Promise<CryptoKey> {
  try {
    const { salt } = parseEnvelope(value);
    return await deriveKey(password, salt);
  } catch {
    throw new UnlockError();
  }
}

/** Decrypt one envelope with a previously derived, non-exportable key. */
export async function decryptEnvelopeWithKey<T>(
  value: unknown,
  key: CryptoKey,
): Promise<T> {
  try {
    const { envelope, iv, ciphertext } = parseEnvelope(value);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asBuffer(iv),
        additionalData: asBuffer(additionalData(envelope.buildId)),
        tagLength: 128,
      },
      key,
      asBuffer(ciphertext),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new UnlockError();
  }
}
