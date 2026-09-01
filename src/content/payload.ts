import { z } from "zod";

import { UnlockError } from "../crypto/envelope";
import { CARD_ID_PATTERN } from "./card-id";
import type { CardV1 } from "./types";

export interface CardsPayloadV1 {
  schema: "cards-v1";
  buildId: string;
  builtAt: string;
  cards: CardV1[];
}

const relativeSourcePath = z.string().min(1).refine(
  (value) =>
    !value.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !value.split(/[\\/]/).includes("..") &&
    !value.includes("\u0000"),
);

const followUpSchema = z
  .object({
    question: z.string().min(1),
    answerMd: z.string().min(1).optional(),
  })
  .strict();

const cardSchema = z
  .object({
    id: z.string().regex(CARD_ID_PATTERN),
    question: z.string().min(1),
    category: z.string().min(1),
    topic: z.string().min(1),
    decks: z.array(z.enum(["sprint", "full"])).min(1),
    priority: z.enum(["P0", "P1", "P2"]),
    quickAnswerMd: z.string().min(1),
    detailMd: z.string().min(1).optional(),
    projectHookMd: z.string().min(1).optional(),
    pitfallsMd: z.string().min(1).optional(),
    followUps: z.array(followUpSchema),
    source: z
      .object({
        path: relativeSourcePath,
        heading: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const cardsPayloadSchema = z
  .object({
    schema: z.literal("cards-v1"),
    buildId: z.string().min(1),
    builtAt: z.iso.datetime({ offset: true }),
    cards: z.array(cardSchema),
  })
  .strict();

export function parseCardsPayload(value: unknown): CardsPayloadV1 {
  try {
    const payload = cardsPayloadSchema.parse(value) as CardsPayloadV1;
    if (new Set(payload.cards.map((card) => card.id)).size !== payload.cards.length) {
      throw new Error("duplicate card id");
    }
    return payload;
  } catch {
    throw new UnlockError();
  }
}
