import { parseCardsPayload, type ParsedCardsPayload } from "../content/payload";
import {
  decryptEnvelope,
  UnlockError,
  type EncryptedEnvelopeV1,
} from "../crypto/envelope";

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

export async function loadEncryptedCards(password: string): Promise<ParsedCardsPayload> {
  const url = `${import.meta.env.BASE_URL}cards.enc.json`;
  const response = await loadEnvelopeResponse(url);
  try {
    const envelope = (await response.json()) as EncryptedEnvelopeV1;
    return parseCardsPayload(await decryptEnvelope<unknown>(envelope, password));
  } catch {
    throw new UnlockError();
  }
}
