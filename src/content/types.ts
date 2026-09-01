export type CardVariant = "full" | "sprint";
export type CardPriority = "P0" | "P1" | "P2";

export interface FollowUpV1 {
  question: string;
  answerMd?: string;
}

export interface ParsedCardVariant {
  id: string;
  question: string;
  category: string;
  topic: string;
  variant: CardVariant;
  priority: CardPriority;
  quickAnswerMd: string;
  detailMd?: string;
  projectHookMd?: string;
  pitfallsMd?: string;
  followUps: FollowUpV1[];
  source: {
    path: string;
    heading: string;
    line: number;
  };
}

export interface ParsedCardDocument {
  schema: 1;
  category: string;
  topic: string;
  variant: CardVariant;
  verifiedAt: string;
  cards: ParsedCardVariant[];
}

export interface CardV1 {
  id: string;
  question: string;
  category: string;
  topic: string;
  decks: Array<"sprint" | "full">;
  priority: CardPriority;
  quickAnswerMd: string;
  detailMd?: string;
  projectHookMd?: string;
  pitfallsMd?: string;
  followUps: FollowUpV1[];
  source: {
    path: string;
    heading: string;
  };
}
