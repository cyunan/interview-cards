import type { CardV2 } from "../content/types";

export type LeitnerLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type Rating = "again" | "fuzzy" | "mastered";
export type Deck = "sprint" | "full";

export interface CardProgress {
  cardId: string;
  level: LeitnerLevel;
  reviewCount: number;
  lastReviewedAt: string;
  dueOn: string;
  reviewedOn?: string[];
}

export interface QueueItem {
  card: CardV2;
  kind: "review" | "new";
}

interface DailyQueueOptions {
  cards: CardV2[];
  progress: ReadonlyMap<string, CardProgress>;
  deck: Deck;
  limit: number;
  today: string;
}

const INTERVAL_DAYS: Record<LeitnerLevel, number> = {
  0: 0,
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number): string {
  return toLocalDateKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12),
  );
}

function clampLevel(value: number): LeitnerLevel {
  return Math.max(0, Math.min(5, value)) as LeitnerLevel;
}

export function applyRating(
  cardId: string,
  previous: CardProgress | undefined,
  rating: Rating,
  reviewedAt = new Date(),
): CardProgress {
  const previousLevel = previous?.level ?? 0;
  const level =
    rating === "again"
      ? 0
      : rating === "fuzzy"
        ? clampLevel(Math.max(1, previousLevel - 1))
        : clampLevel(previousLevel + 1);
  const interval = rating === "again" ? 1 : INTERVAL_DAYS[level];
  const today = toLocalDateKey(reviewedAt);
  const reviewedOn = [...(previous?.reviewedOn ?? [])];
  if (!reviewedOn.includes(today)) {
    reviewedOn.push(today);
  }

  return {
    cardId,
    level,
    reviewCount: (previous?.reviewCount ?? 0) + 1,
    lastReviewedAt: reviewedAt.toISOString(),
    dueOn: addLocalDays(reviewedAt, interval),
    reviewedOn,
  };
}

function wasReviewedOn(record: CardProgress, dateKey: string): boolean {
  if (record.reviewedOn && record.reviewedOn.length > 0) {
    return record.reviewedOn.includes(dateKey);
  }
  return toLocalDateKey(new Date(record.lastReviewedAt)) === dateKey;
}

export function remainingDailyQuota(
  progress: ReadonlyMap<string, CardProgress>,
  knownCardIds: ReadonlySet<string>,
  today: string,
  limit: number,
): number {
  if (!Number.isInteger(limit) || limit <= 0) {
    return 0;
  }
  let reviewedToday = 0;
  for (const record of progress.values()) {
    if (knownCardIds.has(record.cardId) && wasReviewedOn(record, today)) {
      reviewedToday += 1;
    }
  }
  return Math.max(0, limit - reviewedToday);
}

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function stableDailyOrder<T extends { id: string }>(items: T[], seed: string): T[] {
  return [...items].sort((left, right) => {
    const difference = hash(`${seed}:${left.id}`) - hash(`${seed}:${right.id}`);
    return difference || left.id.localeCompare(right.id);
  });
}

function priorityRank(priority: CardV2["priority"]): number {
  return priority === "P0" ? 0 : priority === "P1" ? 1 : 2;
}

export function buildDailyQueue({
  cards,
  progress,
  deck,
  limit,
  today,
}: DailyQueueOptions): QueueItem[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    return [];
  }

  const eligible = cards.filter((card) => card.decks.includes(deck));
  const reviewCards = eligible.filter((card) => {
    const record = progress.get(card.id);
    return (
      record !== undefined &&
      !wasReviewedOn(record, today) &&
      (record.dueOn <= today || record.level <= 1)
    );
  });
  const newCards = eligible.filter((card) => !progress.has(card.id));

  const orderedReviews = stableDailyOrder(reviewCards, `${today}:${deck}:review`).sort(
    (left, right) => {
      const leftProgress = progress.get(left.id);
      const rightProgress = progress.get(right.id);
      return (leftProgress?.level ?? 0) - (rightProgress?.level ?? 0);
    },
  );
  const orderedNew = stableDailyOrder(newCards, `${today}:${deck}:new`).sort(
    (left, right) => priorityRank(left.priority) - priorityRank(right.priority),
  );

  const reviewTarget = Math.round(limit * 0.6);
  const newTarget = limit - reviewTarget;
  const selectedReviews = orderedReviews.slice(0, reviewTarget);
  const selectedNew = orderedNew.slice(0, newTarget);
  let remaining = limit - selectedReviews.length - selectedNew.length;

  if (remaining > 0) {
    const extraReviews = orderedReviews.slice(selectedReviews.length, selectedReviews.length + remaining);
    selectedReviews.push(...extraReviews);
    remaining -= extraReviews.length;
  }
  if (remaining > 0) {
    selectedNew.push(...orderedNew.slice(selectedNew.length, selectedNew.length + remaining));
  }

  const queue = [
    ...selectedReviews.map((card) => ({ card, kind: "review" as const })),
    ...selectedNew.map((card) => ({ card, kind: "new" as const })),
  ];
  return stableDailyOrder(
    queue.map((item) => ({ ...item, id: item.card.id })),
    `${today}:${deck}:queue`,
  ).map(({ id: _id, ...item }) => item);
}

export function scheduleSessionRepeat(
  queueIds: string[],
  failedCardId: string,
  currentIndex: number,
): string[] {
  const queue = queueIds.filter(
    (id, index) => index <= currentIndex || id !== failedCardId,
  );
  const insertionIndex = Math.min(currentIndex + 11, queue.length);
  queue.splice(insertionIndex, 0, failedCardId);
  return queue;
}
