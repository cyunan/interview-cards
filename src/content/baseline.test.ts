import { describe, expect, it } from "vitest";

import { assertReportMatchesBaseline } from "./baseline";
import type { CompileReport } from "./vault";

const report: CompileReport = {
  documents: 46,
  documentsByVariant: { sprint: 15, full: 31 },
  variants: 716,
  cards: 700,
  byDeck: { sprint: 120, full: 596 },
  byPriority: { P0: 120, P1: 580, P2: 0 },
  byCategory: { "01-Kotlin": 128, "02-Android": 281 },
};

describe("assertReportMatchesBaseline", () => {
  it("accepts an exact baseline", () => {
    expect(() => assertReportMatchesBaseline(report, report)).not.toThrow();
  });

  it("reports every changed count", () => {
    expect(() =>
      assertReportMatchesBaseline(report, {
        ...report,
        cards: 699,
        documentsByVariant: { ...report.documentsByVariant, sprint: 14 },
        byDeck: { ...report.byDeck, sprint: 119 },
      }),
    ).toThrow(
      "cards: 期望 699，实际 700; documentsByVariant.sprint: 期望 14，实际 15; byDeck.sprint: 期望 119，实际 120",
    );
  });
});
