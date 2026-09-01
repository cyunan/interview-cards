import { createHash } from "node:crypto";

import type { CardV2 } from "./types";
import type { CompileReport } from "./vault";

export function computeMembershipDigest(cards: Pick<CardV2, "id" | "decks">[]): string {
  const lines = [...cards]
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .map((card) => `${card.id}\t${card.decks.join(",")}\n`)
    .join("");
  return createHash("sha256").update(Buffer.from(lines, "utf8")).digest("hex");
}

export const membershipDigest = computeMembershipDigest;

function compareRecord(label: string, actual: Record<string, number>, expected: Record<string, number>, differences: string[]): void {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of [...keys].sort((left, right) => left.localeCompare(right))) {
    if (actual[key] !== expected[key]) differences.push(`${label}.${key}: 期望 ${expected[key] ?? 0}，实际 ${actual[key] ?? 0}`);
  }
}

export function assertReportMatchesBaseline(actual: CompileReport, expected: CompileReport): void {
  const differences: string[] = [];
  for (const key of ["sourceDocuments", "cards"] as const) {
    if (actual[key] !== expected[key]) differences.push(`${key}: 期望 ${expected[key]}，实际 ${actual[key]}`);
  }
  compareRecord("byDeck", actual.byDeck, expected.byDeck, differences);
  compareRecord("byPriority", actual.byPriority, expected.byPriority, differences);
  compareRecord("byCategory", actual.byCategory, expected.byCategory, differences);
  if (actual.membershipDigest !== expected.membershipDigest) differences.push(`membershipDigest: 期望 ${expected.membershipDigest}，实际 ${actual.membershipDigest}`);
  if (differences.length > 0) throw new Error(`题库数量基线发生变化：${differences.join("; ")}`);
}
