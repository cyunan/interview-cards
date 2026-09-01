import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { z } from "zod";

import { CARD_ID_PATTERN } from "../content/card-id";
import type { CardV2 } from "../content/types";
import { toLocalDateKey, type CardProgress } from "../study/scheduler";

const DAILY_LIMITS = [10, 20, 30, 50] as const;
export type DailyLimit = (typeof DAILY_LIMITS)[number];

const dateKeySchema = z.iso.date();
const progressSchema = z.object({
  cardId: z.string().regex(CARD_ID_PATTERN),
  level: z.number().int().min(0).max(5),
  reviewCount: z.number().int().nonnegative(),
  lastReviewedAt: z.iso.datetime({ offset: true }),
  dueOn: dateKeySchema,
  reviewedOn: z.array(dateKeySchema).optional(),
});
const exportSchema = z.object({
  schema: z.literal("progress-export-v1"),
  exportedAt: z.iso.datetime({ offset: true }),
  dailyLimit: z.union([
    z.literal(10),
    z.literal(20),
    z.literal(30),
    z.literal(50),
  ]),
  records: z.array(progressSchema),
});

export interface ProgressExportV1 {
  schema: "progress-export-v1";
  exportedAt: string;
  dailyLimit: DailyLimit;
  records: CardProgress[];
}

export type ProgressCardIdentity = Pick<CardV2, "id" | "legacyIds">;

interface SettingRecord {
  key: "dailyLimit";
  value: DailyLimit;
}

interface ProgressDatabase extends DBSchema {
  progress: {
    key: string;
    value: CardProgress;
  };
  settings: {
    key: string;
    value: SettingRecord;
  };
}

export function parseProgressExport(json: string): ProgressExportV1 {
  try {
    return exportSchema.parse(JSON.parse(json)) as ProgressExportV1;
  } catch {
    throw new Error("进度文件格式无效");
  }
}

export function mergeProgressRecords(
  existing: CardProgress,
  incoming: CardProgress,
): CardProgress {
  if (existing.cardId !== incoming.cardId) {
    throw new Error("不能合并不同卡片的进度");
  }
  const latest =
    Date.parse(incoming.lastReviewedAt) >= Date.parse(existing.lastReviewedAt)
      ? incoming
      : existing;
  const reviewedOn = [...new Set([
    ...(existing.reviewedOn ?? []),
    ...(incoming.reviewedOn ?? []),
  ])].sort();
  return {
    ...latest,
    reviewCount: Math.max(existing.reviewCount, incoming.reviewCount),
    ...(reviewedOn.length > 0 ? { reviewedOn } : {}),
  };
}

export interface ProgressStore {
  get(cardId: string): Promise<CardProgress | undefined>;
  getAll(): Promise<CardProgress[]>;
  put(progress: CardProgress): Promise<void>;
  clear(): Promise<void>;
  getDailyLimit(): Promise<DailyLimit>;
  setDailyLimit(limit: DailyLimit): Promise<void>;
  exportJson(exportedAt?: string): Promise<string>;
  importJson(json: string): Promise<void>;
  migrateLegacyIds(cards: ReadonlyArray<ProgressCardIdentity>): Promise<void>;
  close(): void;
}

class IndexedDbProgressStore implements ProgressStore {
  constructor(private readonly database: IDBPDatabase<ProgressDatabase>) {}

  get(cardId: string): Promise<CardProgress | undefined> {
    return this.database.get("progress", cardId);
  }

  async getAll(): Promise<CardProgress[]> {
    const records = await this.database.getAll("progress");
    return records.sort((left, right) => left.cardId.localeCompare(right.cardId));
  }

  async put(progress: CardProgress): Promise<void> {
    const validated = progressSchema.parse(progress) as CardProgress;
    await this.database.put("progress", validated);
  }

  async clear(): Promise<void> {
    await this.database.clear("progress");
  }

  async getDailyLimit(): Promise<DailyLimit> {
    return (await this.database.get("settings", "dailyLimit"))?.value ?? 20;
  }

  async setDailyLimit(limit: DailyLimit): Promise<void> {
    if (!DAILY_LIMITS.includes(limit)) {
      throw new Error("每日张数只能是 10、20、30 或 50");
    }
    await this.database.put("settings", { key: "dailyLimit", value: limit });
  }

  async exportJson(exportedAt = new Date().toISOString()): Promise<string> {
    const payload: ProgressExportV1 = {
      schema: "progress-export-v1",
      exportedAt,
      dailyLimit: await this.getDailyLimit(),
      records: await this.getAll(),
    };
    return `${JSON.stringify(payload, null, 2)}\n`;
  }

  async importJson(json: string): Promise<void> {
    const imported = parseProgressExport(json);
    const transaction = this.database.transaction(["progress", "settings"], "readwrite");
    for (const record of imported.records) {
      const existing = await transaction.objectStore("progress").get(record.cardId);
      await transaction.objectStore("progress").put(
        existing ? mergeProgressRecords(existing, record) : record,
      );
    }
    await transaction.objectStore("settings").put({
      key: "dailyLimit",
      value: imported.dailyLimit,
    });
    await transaction.done;
  }

  async migrateLegacyIds(cards: ReadonlyArray<ProgressCardIdentity>): Promise<void> {
    const legacyToCanonical = buildLegacyIdMap(cards);
    if (legacyToCanonical.size === 0) {
      return;
    }

    const transaction = this.database.transaction("progress", "readwrite");
    const progressStore = transaction.objectStore("progress");
    const records = await progressStore.getAll();
    const byId = new Map(records.map((record) => [record.cardId, record]));
    const legacyGroups = new Map<string, CardProgress[]>();

    for (const record of records) {
      const canonicalId = legacyToCanonical.get(record.cardId);
      if (!canonicalId) continue;
      const group = legacyGroups.get(canonicalId) ?? [];
      group.push(record);
      legacyGroups.set(canonicalId, group);
    }

    for (const [canonicalId, legacyRecords] of legacyGroups) {
      const canonicalRecord = byId.get(canonicalId);
      if (!canonicalRecord && legacyRecords.length === 1) {
        const [legacyRecord] = legacyRecords;
        await progressStore.delete(legacyRecord.cardId);
        await progressStore.put({ ...legacyRecord, cardId: canonicalId });
        continue;
      }
      const merged = mergeLegacyProgressRecords(
        canonicalRecord ? [...legacyRecords, canonicalRecord] : legacyRecords,
        canonicalId,
      );
      for (const record of legacyRecords) {
        await progressStore.delete(record.cardId);
      }
      await progressStore.put(merged);
    }
    await transaction.done;
  }

  close(): void {
    this.database.close();
  }
}

function buildLegacyIdMap(cards: ReadonlyArray<ProgressCardIdentity>): Map<string, string> {
  const canonicalIds = new Set(cards.map((card) => card.id));
  const legacyToCanonical = new Map<string, string>();
  for (const card of cards) {
    for (const legacyId of card.legacyIds) {
      if (canonicalIds.has(legacyId)) {
        throw new Error("legacy ID 不能指向现有 canonical ID");
      }
      const existing = legacyToCanonical.get(legacyId);
      if (existing && existing !== card.id) {
        throw new Error("legacy ID 不能指向多张卡片");
      }
      legacyToCanonical.set(legacyId, card.id);
    }
  }
  return legacyToCanonical;
}

export function mergeLegacyProgressRecords(
  records: ReadonlyArray<CardProgress>,
  canonicalId: string,
): CardProgress {
  if (records.length === 0) {
    throw new Error("没有可合并的进度记录");
  }
  const latest = records.reduce((current, record) =>
    Date.parse(record.lastReviewedAt) >= Date.parse(current.lastReviewedAt) ? record : current,
  );
  const reviewedOn = [...new Set(records.flatMap((record) => record.reviewedOn ?? []))].sort();
  return {
    cardId: canonicalId,
    level: Math.min(...records.map((record) => record.level)) as CardProgress["level"],
    reviewCount: Math.max(...records.map((record) => record.reviewCount)),
    lastReviewedAt: latest.lastReviewedAt,
    dueOn: records.map((record) => record.dueOn).sort()[0],
    ...(reviewedOn.length > 0 ? { reviewedOn } : {}),
  };
}

export async function createProgressStore(
  databaseName = "interview-cards-progress",
): Promise<ProgressStore> {
  const database = await openDB<ProgressDatabase>(databaseName, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "cardId" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    },
  });
  return new IndexedDbProgressStore(database);
}

function previousDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return toLocalDateKey(new Date(year, month - 1, day - 1, 12));
}

export function calculateStudyStreak(
  records: CardProgress[],
  today: string,
): number {
  const reviewedDates = new Set<string>();
  for (const record of records) {
    if (record.reviewedOn?.length) {
      record.reviewedOn.forEach((date) => reviewedDates.add(date));
    } else {
      reviewedDates.add(toLocalDateKey(new Date(record.lastReviewedAt)));
    }
  }

  let cursor = reviewedDates.has(today) ? today : previousDate(today);
  if (!reviewedDates.has(cursor)) {
    return 0;
  }
  let streak = 0;
  while (reviewedDates.has(cursor)) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return streak;
}
