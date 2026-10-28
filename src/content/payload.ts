import { z } from "zod";

import { UnlockError } from "../crypto/envelope";
import { CARD_ID_PATTERN } from "./card-id";
import type { CardV1, CardV2 } from "./types";
import type { KnowledgeRoute } from "../routes/routes";

export interface CardsPayloadV1 {
  schema: "cards-v1";
  buildId: string;
  builtAt: string;
  cards: CardV1[];
}

export interface ReferenceDocument {
  id: string;
  title: string;
  sourcePath: string;
  heading?: string;
  reason: string;
  markdown: string;
  images?: ReferenceImage[];
}

export interface ReferenceImage {
  id: string;
  alt: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml";
  data: string;
}

export interface CardsPayloadV2 {
  schema: "cards-v2";
  buildId: string;
  builtAt: string;
  cards: CardV2[];
  documents?: ReferenceDocument[];
}

export type ParsedCardsPayload = {
  schema: "cards-v1" | "cards-v2" | "cards-v3";
  buildId: string;
  builtAt: string;
  cards: CardV2[];
  documents?: ReferenceDocument[];
  routes?: KnowledgeRoute[];
};

export type CardsPayloadV3 = ParsedCardsPayload & { schema: "cards-v3"; routes: KnowledgeRoute[] };

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
const referenceImageSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{16,64}$/),
  alt: z.string(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]),
  data: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();
const referenceImageTokenPattern = /^https:\/\/interview-cards\.invalid\/reference-image\/[a-f0-9]{16,64}$/;
const referenceImageOriginPattern = /^https:\/\/cdn\.nlark\.com\//;
function hasOnlySupportedReferenceImages(markdown: string): boolean {
  const imagePattern = /!\[[^\]]*\]\(([^)]+)\)|!\[[^\]]+\]/g;
  for (const match of markdown.matchAll(imagePattern)) {
    const target = match[1];
    if (!target || (!referenceImageTokenPattern.test(target) && !referenceImageOriginPattern.test(target))) return false;
  }
  return true;
}
const referenceDocumentSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  title: z.string().min(1),
  sourcePath: relativeSourcePath,
  heading: z.string().min(1).optional(),
  reason: z.string().min(1),
  markdown: z.string().min(1).refine(hasOnlySupportedReferenceImages),
  images: z.array(referenceImageSchema).optional(),
}).strict();
const payloadBase = { buildId: z.string().min(1), builtAt: z.iso.datetime({ offset: true }) };
const cardsPayloadV1Schema = z.object({ ...payloadBase, schema: z.literal("cards-v1"), cards: z.array(cardV1Schema) }).strict();
const cardsPayloadV2Schema = z.object({ ...payloadBase, schema: z.literal("cards-v2"), cards: z.array(cardV2Schema), documents: z.array(referenceDocumentSchema).optional() }).strict();
const checkpointSchema = z.object({ cardId: z.string().regex(CARD_ID_PATTERN), followUpIndex: z.number().int().nonnegative().optional() }).strict();
const routeSchema = z.object({
  id: z.string().regex(CARD_ID_PATTERN), title: z.string().min(1), summary: z.string(), level: z.string(), estimatedMinutes: z.number().positive(),
  scenario: z.string().optional(), outcomes: z.array(z.string()).optional(),
  steps: z.array(z.object({
    id: z.string().regex(CARD_ID_PATTERN), title: z.string().min(1), shortTitle: z.string().optional(), purpose: z.string(), transition: z.string(),
    cardIds: z.array(z.string().regex(CARD_ID_PATTERN)).min(1), checkpoint: checkpointSchema.optional(),
    referenceDocuments: z.array(z.object({ documentId: z.string().regex(CARD_ID_PATTERN), reason: z.string().optional() }).strict()).optional(),
  }).strict()).min(1),
}).strict();
const cardsPayloadV3Schema = z.object({ ...payloadBase, schema: z.literal("cards-v3"), cards: z.array(cardV2Schema.extend({ images: z.array(referenceImageSchema).optional() })), documents: z.array(referenceDocumentSchema), routes: z.array(routeSchema) }).strict();

export function validateRouteReferences(payload: Pick<ParsedCardsPayload, "cards" | "documents" | "routes">): void {
  const cards = new Map(payload.cards.map((card) => [card.id, card]));
  const docs = new Set(payload.documents?.map((document) => document.id));
  const routeIds = new Set<string>();
  const stepIds = new Set<string>();
  for (const route of payload.routes ?? []) {
    if (routeIds.has(route.id)) throw new Error(`重复路线 ID: ${route.id}`);
    routeIds.add(route.id);
    for (const step of route.steps) {
      if (stepIds.has(step.id)) throw new Error(`重复阶段 ID: ${step.id}`);
      stepIds.add(step.id);
      for (const id of step.cardIds) if (!cards.has(id)) throw new Error(`路线引用不存在的卡片: ${id}`);
      for (const reference of step.referenceDocuments ?? []) if (!docs.has(reference.documentId)) throw new Error(`路线引用不存在的资料: ${reference.documentId}`);
      if (step.checkpoint) {
        const card = cards.get(step.checkpoint.cardId);
        if (!card || !step.cardIds.includes(card.id)) throw new Error(`检查题不在阶段内: ${step.checkpoint.cardId}`);
        if (step.checkpoint.followUpIndex !== undefined && !card.followUps[step.checkpoint.followUpIndex]) throw new Error(`检查题追问不存在: ${card.id}`);
      }
    }
  }
}

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

function ensureUniqueDocumentIds(documents: ReferenceDocument[]): void {
  const ids = new Set<string>();
  for (const document of documents) {
    if (ids.has(document.id)) throw new Error("duplicate reference document id");
    ids.add(document.id);
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
    const payload = schema === "cards-v3" ? cardsPayloadV3Schema.parse(value) : cardsPayloadV2Schema.parse(value);
    ensureUniqueV2Ids(payload.cards);
    const documents = payload.documents ?? [];
    ensureUniqueDocumentIds(documents);
    if (schema === "cards-v3") validateRouteReferences(payload);
    return { ...payload, documents };
  } catch {
    throw new UnlockError();
  }
}
