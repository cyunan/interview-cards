import { describe, expect, it } from "vitest";

import { assertReportMatchesBaseline, computeMembershipDigest } from "./baseline";
import type { CompileReport } from "./vault";

const report: CompileReport = {
  sourceDocuments: 2,
  cards: 2,
  byDeck: { sprint: 1, full: 2 },
  byPriority: { P0: 1, P1: 1, P2: 0 },
  byCategory: { "01-Kotlin": 1, "02-Android": 1 },
  membershipDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};

describe("assertReportMatchesBaseline", () => {
  it("computes a stable UTF-8 digest from sorted memberships", () => {
    expect(computeMembershipDigest([
      { id: "card-10", decks: ["sprint", "full"] },
      { id: "card-2", decks: ["full"] },
      { id: "card-1", decks: ["full"] },
    ])).toBe("d1670dde53c2f912bfbb89e507479d556669053b5b9c06e9c85ed6745c00e71f");
  });

  it("accepts an exact v2 baseline", () => {
    expect(() => assertReportMatchesBaseline(report, report)).not.toThrow();
  });

  it("detects membership changes even when all counts stay unchanged", () => {
    expect(() => assertReportMatchesBaseline(report, {
      ...report,
      membershipDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    })).toThrow("membershipDigest");
  });

  it("reports changed source documents and aggregates", () => {
    expect(() => assertReportMatchesBaseline(report, {
      ...report,
      sourceDocuments: 1,
      byDeck: { sprint: 0, full: 2 },
    })).toThrow("sourceDocuments");
  });
});
