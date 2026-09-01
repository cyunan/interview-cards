import type { CardPriority, CardV1, ParsedCardVariant } from "./types";
import { normalizeObsidianMarkdown } from "./markdown";

const PRIORITY_ORDER: Record<CardPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

function strongestPriority(variants: ParsedCardVariant[]): CardPriority {
  return variants.reduce<CardPriority>(
    (current, variant) =>
      PRIORITY_ORDER[variant.priority] < PRIORITY_ORDER[current]
        ? variant.priority
        : current,
    "P2",
  );
}

export function mergeCardVariants(variants: ParsedCardVariant[]): CardV1[] {
  const grouped = new Map<string, ParsedCardVariant[]>();
  for (const variant of variants) {
    const values = grouped.get(variant.id) ?? [];
    values.push(variant);
    grouped.set(variant.id, values);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, values]) => {
      const fullValues = values.filter((value) => value.variant === "full");
      const sprintValues = values.filter((value) => value.variant === "sprint");
      if (fullValues.length > 1) {
        throw new Error(
          `${fullValues[0].source.path}:${fullValues[0].source.line} ${id} 存在多个 full 版本：${fullValues
            .map((value) => `${value.source.path}:${value.source.line}#${value.source.heading}`)
            .join("；")}`,
        );
      }
      if (sprintValues.length > 1) {
        throw new Error(
          `${sprintValues[0].source.path}:${sprintValues[0].source.line} ${id} 存在多个 sprint 版本：${sprintValues
            .map((value) => `${value.source.path}:${value.source.line}#${value.source.heading}`)
            .join("；")}`,
        );
      }

      const full = fullValues[0];
      const sprint = sprintValues[0];
      const canonical = full ?? sprint;
      if (!canonical) {
        throw new Error(`${id} 没有可用内容`);
      }

      const detail = full?.detailMd ?? sprint?.detailMd;
      const detailMd = detail
        ? normalizeObsidianMarkdown(detail)
        : undefined;
      const projectHook = sprint?.projectHookMd ?? full?.projectHookMd;
      const projectHookMd = projectHook
        ? normalizeObsidianMarkdown(projectHook)
        : undefined;
      const pitfalls = full?.pitfallsMd ?? sprint?.pitfallsMd;
      const pitfallsMd = pitfalls
        ? normalizeObsidianMarkdown(pitfalls)
        : undefined;
      const followUps =
        full && full.followUps.length > 0
          ? full.followUps
          : (sprint?.followUps ?? []);

      return {
        id,
        question: normalizeObsidianMarkdown(canonical.question),
        category: canonical.category,
        topic: canonical.topic,
        decks: [
          ...(sprint ? (["sprint"] as const) : []),
          ...(full ? (["full"] as const) : []),
        ],
        priority: strongestPriority(values),
        quickAnswerMd: normalizeObsidianMarkdown(
          sprint?.quickAnswerMd ?? canonical.quickAnswerMd,
        ),
        ...(detailMd ? { detailMd } : {}),
        ...(projectHookMd ? { projectHookMd } : {}),
        ...(pitfallsMd ? { pitfallsMd } : {}),
        followUps: followUps.map(
          (followUp) => ({
            question: normalizeObsidianMarkdown(followUp.question),
            answerMd: followUp.answerMd
              ? normalizeObsidianMarkdown(followUp.answerMd)
              : undefined,
          }),
        ),
        source: {
          path: canonical.source.path,
          heading: normalizeObsidianMarkdown(canonical.source.heading),
        },
      } satisfies CardV1;
    });
}
