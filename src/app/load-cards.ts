import { parseCardsPayload, type ParsedCardsPayload } from "../content/payload";
import {
  decryptEnvelopeWithKey,
  deriveEnvelopeKey,
  UnlockError,
  type EncryptedEnvelopeV1,
  validateEncryptedEnvelope,
} from "../crypto/envelope";
import type { RememberedUnlockStore } from "../security/remembered-unlock";

export class CardBankUnavailableError extends Error {
  constructor() {
    super("题库暂时不可用");
    this.name = "CardBankUnavailableError";
  }
}

async function loadEnvelopeResponse(url: string): Promise<Response> {
  try {
    const response = await fetch(url, {
      cache: "no-cache",
      credentials: "same-origin",
    });
    if (response.ok) {
      return response;
    }
  } catch {
    // CacheStorage below is an explicit offline fallback for browsers whose
    // network emulation bypasses service-worker fetch handling.
  }

  try {
    if (typeof caches !== "undefined") {
      const cached = await caches.match(url, { ignoreSearch: true });
      if (cached?.ok) {
        return cached;
      }
    }
  } catch {
    // The public error intentionally does not reveal cache or network details.
  }
  throw new CardBankUnavailableError();
}

export interface DecryptedCardsSession {
  payload: ParsedCardsPayload;
  envelope: EncryptedEnvelopeV1;
  key: CryptoKey;
}

export async function loadEncryptedEnvelope(): Promise<EncryptedEnvelopeV1> {
  const url = `${import.meta.env.BASE_URL}cards.enc.json`;
  const response = await loadEnvelopeResponse(url);
  try {
    return validateEncryptedEnvelope(await response.json());
  } catch {
    throw new UnlockError();
  }
}

export async function loadEncryptedCardsSession(
  password: string,
): Promise<DecryptedCardsSession> {
  const envelope = await loadEncryptedEnvelope();
  const key = await deriveEnvelopeKey(envelope, password);
  const payload = parseCardsPayload(
    await decryptEnvelopeWithKey<unknown>(envelope, key),
  );
  return { payload, envelope, key };
}

export async function loadEncryptedCards(password: string): Promise<ParsedCardsPayload> {
  return (await loadEncryptedCardsSession(password)).payload;
}

export async function restoreRememberedCards(
  store: RememberedUnlockStore,
): Promise<ParsedCardsPayload | undefined> {
  const record = await store.get();
  if (!record) return undefined;

  let envelope: EncryptedEnvelopeV1;
  try {
    envelope = await loadEncryptedEnvelope();
  } catch (error) {
    if (error instanceof CardBankUnavailableError) {
      return undefined;
    }
    await store.clear();
    return undefined;
  }

  if (record.buildId !== envelope.buildId || record.salt !== envelope.kdf.salt) {
    await store.clear();
    return undefined;
  }

  try {
    return parseCardsPayload(
      await decryptEnvelopeWithKey<unknown>(envelope, record.key),
    );
  } catch {
    await store.clear();
    return undefined;
  }
}
