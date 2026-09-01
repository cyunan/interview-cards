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
      { id: "b", decks: ["sprint", "full"] },
      { id: "a", decks: ["full"] },
    ])).toBe("4fa2d2eee1690f8df1f15763f0e266cafdd0f9b281254e4cb4568a106de15788");
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
