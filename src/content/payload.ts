import { z } from "zod";

import { UnlockError } from "../crypto/envelope";
import { CARD_ID_PATTERN } from "./card-id";
import type { CardV1, CardV2 } from "./types";

export interface CardsPayloadV1 {
  schema: "cards-v1";
  buildId: string;
  builtAt: string;
  cards: CardV1[];
}

export interface CardsPayloadV2 {
  schema: "cards-v2";
  buildId: string;
  builtAt: string;
  cards: CardV2[];
}

export type ParsedCardsPayload = {
  schema: "cards-v1" | "cards-v2";
  buildId: string;
  builtAt: string;
  cards: CardV2[];
};

const relativeSourcePath = z.string().min(1).refine((value) => !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value) && !value.split(/[\\/]/).includes("..") && !value.includes("\u0000"));
const followUpSchema = z.object({ question: z.string().min(1), answerMd: z.string().min(1).optional() }).strict();
const commonCard = {
  id: z.string().regex(CARD_ID_PATTERN),
  question: z.string().min(1),
  category: z.string().min(1),
  topic: z.string().min(1),
  priority: z.enum(["P0", "P1", "P2"]),
  quickAnswerMd: z.string().min(1),
  detailMd: z.string().min(1).optional(),
  projectHookMd: z.string().min(1).optional(),
  pitfallsMd: z.string().min(1).optional(),
  followUps: z.array(followUpSchema),
  source: z.object({ path: relativeSourcePath, heading: z.string().min(1) }).strict(),
};
const decksSchema = z.array(z.enum(["sprint", "full"])).refine((decks) => decks.length === 1 && decks[0] === "full" || decks.length === 2 && decks[0] === "sprint" && decks[1] === "full");
const cardV1Schema = z.object({ ...commonCard, decks: z.array(z.enum(["sprint", "full"])).min(1) }).strict();
const cardV2Schema = z.object({ ...commonCard, legacyIds: z.array(z.string().regex(CARD_ID_PATTERN)), decks: decksSchema }).strict();
const payloadBase = { buildId: z.string().min(1), builtAt: z.iso.datetime({ offset: true }) };
const cardsPayloadV1Schema = z.object({ ...payloadBase, schema: z.literal("cards-v1"), cards: z.array(cardV1Schema) }).strict();
const cardsPayloadV2Schema = z.object({ ...payloadBase, schema: z.literal("cards-v2"), cards: z.array(cardV2Schema) }).strict();

function ensureUniqueV2Ids(cards: CardV2[]): void {
  const canonical = new Set<string>();
  const legacy = new Set<string>();
  for (const card of cards) {
    if (canonical.has(card.id)) throw new Error("duplicate card id");
    if (legacy.has(card.id)) throw new Error("canonical card id conflicts with legacy id");
    canonical.add(card.id);
    for (const legacyId of card.legacyIds) {
      if (legacy.has(legacyId) || canonical.has(legacyId)) throw new Error("duplicate legacy id");
      legacy.add(legacyId);
    }
  }
}

export function parseCardsPayload(value: unknown): ParsedCardsPayload {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("payload");
    const schema = (value as { schema?: unknown }).schema;
    if (schema === "cards-v1") {
      const payload = cardsPayloadV1Schema.parse(value);
      return { ...payload, cards: payload.cards.map((card) => ({ ...card, legacyIds: [] })) };
    }
    const payload = cardsPayloadV2Schema.parse(value);
    ensureUniqueV2Ids(payload.cards);
    return payload;
  } catch {
    throw new UnlockError();
  }
}
