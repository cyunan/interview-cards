export type CardDeck = "sprint" | "full";
export type CardPriority = "P0" | "P1" | "P2";

export interface FollowUpV1 {
  question: string;
  answerMd?: string;
}

export interface CardSource {
  path: string;
  heading: string;
}

export interface ParsedCard {
  id: string;
  legacyIds: string[];
  question: string;
  category: string;
  topic: string;
  decks: CardDeck[];
  priority: CardPriority;
  quickAnswerMd: string;
  detailMd?: string;
  projectHookMd?: string;
  pitfallsMd?: string;
  followUps: FollowUpV1[];
  source: CardSource & { line: number };
}

export interface ParsedCardDocument {
  schema: 2;
  category: string;
  topic: string;
  verifiedAt: string;
  cards: ParsedCard[];
}

export interface CardV2 {
  id: string;
  legacyIds: string[];
  question: string;
  category: string;
  topic: string;
  decks: CardDeck[];
  priority: CardPriority;
  quickAnswerMd: string;
  detailMd?: string;
  projectHookMd?: string;
  pitfallsMd?: string;
  followUps: FollowUpV1[];
  source: CardSource;
}

/** Raw card shape accepted only while normalizing cards-v1 payloads. */
export interface CardV1 {
  id: string;
  question: string;
  category: string;
  topic: string;
  decks: CardDeck[];
  priority: CardPriority;
  quickAnswerMd: string;
  detailMd?: string;
  projectHookMd?: string;
  pitfallsMd?: string;
  followUps: FollowUpV1[];
  source: CardSource;
}
