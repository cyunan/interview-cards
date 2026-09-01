import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import type { CardV2 } from "../content/types";
import type { CardProgress } from "../study/scheduler";
import {
  calculateStudyStreak,
  createProgressStore,
  mergeProgressRecords,
  parseProgressExport,
} from "./progress";

function record(
  cardId: string,
  lastReviewedAt: string,
  overrides: Partial<CardProgress> = {},
): CardProgress {
  return {
    cardId,
    level: 2,
    reviewCount: 2,
    lastReviewedAt,
    dueOn: "2026-09-03",
    reviewedOn: [lastReviewedAt.slice(0, 10)],
    ...overrides,
  };
}

function cardRef(id: string, legacyIds: string[]): Pick<CardV2, "id" | "legacyIds"> {
  return { id, legacyIds };
}

describe("progress store", () => {
  it("persists only progress records and local study settings", async () => {
    const store = await createProgressStore("progress-test-save");
    const progress = record("fictional-card-001", "2026-08-31T08:00:00.000Z");

    await store.put(progress);
    await store.setDailyLimit(30);

    await expect(store.get("fictional-card-001")).resolves.toEqual(progress);
    await expect(store.getAll()).resolves.toEqual([progress]);
    await expect(store.getDailyLimit()).resolves.toBe(30);
    store.close();
  });

  it("exports JSON and merge-imports newer scheduling while preserving counts and orphans", async () => {
    const store = await createProgressStore("progress-test-import");
    await store.put(
      record("fictional-card-001", "2026-08-30T08:00:00.000Z", {
        reviewCount: 5,
        reviewedOn: ["2026-08-29", "2026-08-30"],
      }),
    );
    const imported = JSON.stringify({
      schema: "progress-export-v1",
      exportedAt: "2026-08-31T09:00:00.000Z",
      dailyLimit: 50,
      records: [
        record("fictional-card-001", "2026-08-31T08:00:00.000Z", {
          level: 4,
          reviewCount: 3,
          reviewedOn: ["2026-08-31"],
        }),
        record("deleted-or-remote-card", "2026-08-31T07:00:00.000Z"),
      ],
    });

    await store.importJson(imported);

    await expect(store.get("fictional-card-001")).resolves.toMatchObject({
      level: 4,
      reviewCount: 5,
      reviewedOn: ["2026-08-29", "2026-08-30", "2026-08-31"],
    });
    await expect(store.get("deleted-or-remote-card")).resolves.toBeDefined();
    await expect(store.getDailyLimit()).resolves.toBe(50);
    expect(JSON.parse(await store.exportJson("2026-08-31T10:00:00.000Z"))).toMatchObject({
      schema: "progress-export-v1",
      exportedAt: "2026-08-31T10:00:00.000Z",
      dailyLimit: 50,
    });
    store.close();
  });

  it("clears progress only after the caller has confirmed the destructive action", async () => {
    const store = await createProgressStore("progress-test-clear");
    await store.put(record("fictional-card-001", "2026-08-31T08:00:00.000Z"));

    await store.clear();

    await expect(store.getAll()).resolves.toEqual([]);
    store.close();
  });
});

describe("progress import validation", () => {
  it("rejects malformed or out-of-range data", () => {
    expect(() => parseProgressExport("{}"))
      .toThrow("进度文件格式无效");
    expect(() =>
      parseProgressExport(
        JSON.stringify({
          schema: "progress-export-v1",
          exportedAt: "invalid",
          dailyLimit: 17,
          records: [],
        }),
      ),
    ).toThrow("进度文件格式无效");

    expect(() =>
      parseProgressExport(
        JSON.stringify({
          schema: "progress-export-v1",
          exportedAt: "2026-08-31T09:00:00.000Z",
          dailyLimit: 20,
          records: [
            record("private answer copied into an id", "2026-08-31T08:00:00.000Z"),
          ],
        }),
      ),
    ).toThrow("进度文件格式无效");

    expect(() =>
      parseProgressExport(
        JSON.stringify({
          schema: "progress-export-v1",
          exportedAt: "2026-08-31T09:00:00.000Z",
          dailyLimit: 20,
          records: [
            record("fictional-card-001", "2026-08-31T08:00:00.000Z", {
              dueOn: "2026-99-99",
              reviewedOn: ["2026-99-99"],
            }),
          ],
        }),
      ),
    ).toThrow("进度文件格式无效");
  });

  it("merges by latest review without decreasing the review count", () => {
    const older = record("fictional-card-001", "2026-08-30T08:00:00.000Z", {
      level: 5,
      reviewCount: 8,
    });
    const newer = record("fictional-card-001", "2026-08-31T08:00:00.000Z", {
      level: 1,
      reviewCount: 2,
    });

    expect(mergeProgressRecords(older, newer)).toMatchObject({
      level: 1,
      reviewCount: 8,
      lastReviewedAt: newer.lastReviewedAt,
    });
  });

  it("compares imported review timestamps by instant rather than offset text", () => {
    const older = record("fictional-card-001", "2026-08-31T12:00:00+08:00", {
      level: 4,
    });
    const newer = record("fictional-card-001", "2026-08-31T05:00:00+00:00", {
      level: 1,
    });

    expect(mergeProgressRecords(older, newer)).toMatchObject({
      level: 1,
      lastReviewedAt: newer.lastReviewedAt,
    });
  });
});

describe("legacy progress migration", () => {
  it("leaves records unchanged when no legacy mapping applies", async () => {
    const store = await createProgressStore("progress-test-migration-noop");
    const current = record("current-card-001", "2026-08-31T08:00:00.000Z");
    const orphan = record("removed-card-001", "2026-08-30T08:00:00.000Z");
    await store.put(current);
    await store.put(orphan);

    await store.migrateLegacyIds([
      cardRef("current-card-001", []),
      cardRef("new-card-001", ["different-old-card"]),
    ]);

    await expect(store.getAll()).resolves.toEqual([current, orphan]);
    store.close();
  });

  it("moves a one-to-one legacy record to the canonical ID and deletes the old key", async () => {
    const store = await createProgressStore("progress-test-migration-one-to-one");
    const old = record("old-card-001", "2026-08-31T08:00:00.000Z", {
      level: 3,
      reviewCount: 4,
      reviewedOn: ["2026-08-31", "2026-08-29", "2026-08-31"],
    });
    await store.put(old);

    await store.migrateLegacyIds([cardRef("new-card-001", ["old-card-001"])]);

    await expect(store.get("old-card-001")).resolves.toBeUndefined();
    await expect(store.get("new-card-001")).resolves.toEqual({ ...old, cardId: "new-card-001" });
    store.close();
  });

  it("preserves an empty reviewedOn array during a one-to-one migration", async () => {
    const store = await createProgressStore("progress-test-migration-one-to-one-empty-dates");
    const old = record("old-card-001", "2026-08-31T08:00:00.000Z", {
      reviewedOn: [],
    });
    await store.put(old);

    await store.migrateLegacyIds([cardRef("new-card-001", ["old-card-001"])]);

    await expect(store.get("new-card-001")).resolves.toEqual({ ...old, cardId: "new-card-001" });
    store.close();
  });

  it("merges all legacy records with an existing canonical record using migration rules", async () => {
    const store = await createProgressStore("progress-test-migration-many-to-one");
    await store.put(record("new-card-001", "2026-08-31T12:00:00+08:00", {
      level: 4,
      dueOn: "2026-09-10",
      reviewCount: 3,
      reviewedOn: ["2026-08-31"],
    }));
    await store.put(record("old-card-001", "2026-08-31T05:00:00+00:00", {
      level: 2,
      dueOn: "2026-09-04",
      reviewCount: 7,
      reviewedOn: ["2026-08-29", "2026-08-31"],
    }));
    await store.put(record("old-card-002", "2026-08-31T04:00:00+00:00", {
      level: 1,
      dueOn: "2026-09-02",
      reviewCount: 5,
      reviewedOn: ["2026-08-30"],
    }));

    await store.migrateLegacyIds([cardRef("new-card-001", ["old-card-001", "old-card-002"])]);

    await expect(store.get("new-card-001")).resolves.toEqual({
      cardId: "new-card-001",
      level: 1,
      dueOn: "2026-09-02",
      lastReviewedAt: "2026-08-31T05:00:00+00:00",
      reviewCount: 7,
      reviewedOn: ["2026-08-29", "2026-08-30", "2026-08-31"],
    });
    await expect(store.get("old-card-001")).resolves.toBeUndefined();
    await expect(store.get("old-card-002")).resolves.toBeUndefined();
    store.close();
  });

  it("preserves orphans and is idempotent when run repeatedly", async () => {
    const store = await createProgressStore("progress-test-migration-idempotent");
    const orphan = record("removed-card-001", "2026-08-31T08:00:00.000Z");
    await store.put(orphan);
    await store.put(record("old-card-001", "2026-08-31T08:00:00.000Z"));
    const mapping = [cardRef("new-card-001", ["old-card-001"])] as const;

    await store.migrateLegacyIds(mapping);
    const afterFirstRun = await store.getAll();
    await store.migrateLegacyIds(mapping);

    await expect(store.getAll()).resolves.toEqual(afterFirstRun);
    await expect(store.get("removed-card-001")).resolves.toEqual(orphan);
    store.close();
  });

  it("migrates legacy IDs after importing progress data", async () => {
    const store = await createProgressStore("progress-test-migration-after-import");
    const imported = JSON.stringify({
      schema: "progress-export-v1",
      exportedAt: "2026-08-31T09:00:00.000Z",
      dailyLimit: 20,
      records: [record("old-card-001", "2026-08-31T08:00:00.000Z")],
    });

    await store.importJson(imported);
    await store.migrateLegacyIds([cardRef("new-card-001", ["old-card-001"])]);

    await expect(store.get("old-card-001")).resolves.toBeUndefined();
    await expect(store.get("new-card-001")).resolves.toMatchObject({ cardId: "new-card-001" });
    store.close();
  });
});

describe("calculateStudyStreak", () => {
  it("counts consecutive local study dates through today or yesterday", () => {
    const records = [
      record("one", "2026-08-31T08:00:00.000Z", {
        reviewedOn: ["2026-08-28", "2026-08-29", "2026-08-30"],
      }),
      record("two", "2026-08-31T09:00:00.000Z", { reviewedOn: ["2026-08-31"] }),
    ];

    expect(calculateStudyStreak(records, "2026-08-31")).toBe(4);
    expect(calculateStudyStreak(records, "2026-09-01")).toBe(4);
    expect(calculateStudyStreak(records, "2026-09-02")).toBe(0);
  });
});
