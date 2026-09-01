import type { CompileReport } from "./vault";

function compareRecord(
  label: string,
  actual: Record<string, number>,
  expected: Record<string, number>,
  differences: string[],
): void {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of [...keys].sort((left, right) => left.localeCompare(right))) {
    if (actual[key] !== expected[key]) {
      differences.push(
        `${label}.${key}: 期望 ${expected[key] ?? 0}，实际 ${actual[key] ?? 0}`,
      );
    }
  }
}

export function assertReportMatchesBaseline(
  actual: CompileReport,
  expected: CompileReport,
): void {
  const differences: string[] = [];
  for (const key of ["documents", "variants", "cards"] as const) {
    if (actual[key] !== expected[key]) {
      differences.push(`${key}: 期望 ${expected[key]}，实际 ${actual[key]}`);
    }
  }
  compareRecord(
    "documentsByVariant",
    actual.documentsByVariant,
    expected.documentsByVariant,
    differences,
  );
  compareRecord("byDeck", actual.byDeck, expected.byDeck, differences);
  compareRecord("byPriority", actual.byPriority, expected.byPriority, differences);
  compareRecord("byCategory", actual.byCategory, expected.byCategory, differences);

  if (differences.length > 0) {
    throw new Error(`题库数量基线发生变化：${differences.join("; ")}`);
  }
}
