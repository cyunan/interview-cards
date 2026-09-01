import matter from "gray-matter";

import type {
  CardPriority,
  CardVariant,
  FollowUpV1,
  ParsedCardDocument,
  ParsedCardVariant,
} from "./types";

interface ParseCardDocumentInput {
  path: string;
  source: string;
}

interface CardMetadata {
  id: string;
  priority: CardPriority;
  line: number;
}

const CARD_META_PATTERN =
  /^%%card-id:\s*([a-z0-9][a-z0-9-]{2,79});\s*priority:\s*(P[0-2])%%$/;
const IGNORED_SECTION_PATTERN = /^(使用说明|参考资料|导航|附：?相关资料)/;

export class CardFormatError extends Error {
  constructor(path: string, line: number, reason: string) {
    super(`${path}:${line} ${reason}`);
    this.name = "CardFormatError";
  }
}

function frontmatterLineCount(source: string): number {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? (match[0].match(/\n/g) ?? []).length : 0;
}

function cleanQuotedMarkdown(lines: string[]): string | undefined {
  const value = lines
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
  return value.length > 0 ? value : undefined;
}

function extractCallout(
  lines: string[],
  type: "summary" | "tip" | "warning",
): { value?: string; indexes: Set<number> } {
  const indexes = new Set<number>();
  const marker = new RegExp(`^> \\[!${type}\\](?:[+-])?(?:\\s+.*)?$`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    if (!marker.test(lines[index].trim())) {
      continue;
    }

    indexes.add(index);
    const content: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (!lines[cursor].trimStart().startsWith(">")) {
        break;
      }
      indexes.add(cursor);
      content.push(lines[cursor]);
    }
    return { value: cleanQuotedMarkdown(content), indexes };
  }

  return { indexes };
}

function trimMarkdownLines(lines: string[]): string | undefined {
  const value = lines.join("\n").trim();
  return value.length > 0 ? value : undefined;
}

function parseFollowUps(lines: string[]): FollowUpV1[] {
  const sectionStart = lines.findIndex((line) => /^####\s+高频追问\s*$/.test(line));
  if (sectionStart < 0) {
    return [];
  }

  const followUps: FollowUpV1[] = [];
  let cursor = sectionStart + 1;
  while (cursor < lines.length) {
    const heading = lines[cursor].match(/^#####\s+(.+?)\s*$/);
    if (!heading) {
      cursor += 1;
      continue;
    }

    const answer: string[] = [];
    cursor += 1;
    while (
      cursor < lines.length &&
      !/^#{4,5}\s+/.test(lines[cursor])
    ) {
      answer.push(lines[cursor]);
      cursor += 1;
    }
    followUps.push({
      question: heading[1].trim(),
      answerMd: cleanQuotedMarkdown(answer),
    });
  }
  return followUps;
}

function extractDetail(
  lines: string[],
  excludedIndexes: Set<number>,
): string | undefined {
  const start = lines.findIndex((line) => /^####\s+展开要点\s*$/.test(line));
  if (start < 0) {
    return undefined;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^####\s+高频追问\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const detail = lines.slice(start + 1, end).filter((_, offset) => {
    const originalIndex = start + 1 + offset;
    return !excludedIndexes.has(originalIndex);
  });
  return trimMarkdownLines(detail);
}

function plainTextLength(markdown: string): number {
  return markdown
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/[*_`#>\[\]()-]/g, "")
    .trim().length;
}

function parseCardBody(
  lines: string[],
  context: {
    path: string;
    line: number;
    metadata: CardMetadata;
    question: string;
    category: string;
    topic: string;
    variant: CardVariant;
  },
): ParsedCardVariant {
  if (lines.some((line) => /!\[\[|!\[[^\]]*\]\(/.test(line))) {
    throw new CardFormatError(context.path, context.line, "卡片内容不能包含图片");
  }

  const summary = extractCallout(lines, "summary");
  if (!summary.value) {
    throw new CardFormatError(context.path, context.line, "缺少 [!summary] 30 秒回答");
  }
  if (plainTextLength(summary.value) > 220) {
    throw new CardFormatError(context.path, context.line, "30 秒回答超过 220 个字符");
  }

  const projectHook = extractCallout(lines, "tip");
  const pitfalls = extractCallout(lines, "warning");
  const excluded = new Set([
    ...summary.indexes,
    ...projectHook.indexes,
    ...pitfalls.indexes,
  ]);

  return {
    id: context.metadata.id,
    question: context.question,
    category: context.category,
    topic: context.topic,
    variant: context.variant,
    priority: context.metadata.priority,
    quickAnswerMd: summary.value,
    detailMd: extractDetail(lines, excluded),
    projectHookMd: projectHook.value,
    pitfallsMd: pitfalls.value,
    followUps: parseFollowUps(lines),
    source: {
      path: context.path,
      heading: context.question,
      line: context.line,
    },
  };
}

function requireString(
  data: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CardFormatError(path, 1, `Frontmatter 缺少 ${key}`);
  }
  return value.trim();
}

function requireVerifiedAt(source: string, path: string): string {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) {
    throw new CardFormatError(path, 1, "verified_at 必须为真实日期 YYYY-MM-DD");
  }
  const lines = frontmatter[1].split(/\r?\n/);
  const matches = lines
    .map((line, index) => ({ line, number: index + 2 }))
    .filter((entry) => /^verified_at\s*:/.test(entry.line));
  const match = matches[0]?.line.match(
    /^verified_at\s*:\s*(["']?)(\d{4})-(\d{2})-(\d{2})\1\s*$/,
  );
  if (matches.length !== 1 || !match) {
    throw new CardFormatError(
      path,
      matches[0]?.number ?? 1,
      "verified_at 必须为真实日期 YYYY-MM-DD",
    );
  }

  const year = Number(match[2]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new CardFormatError(
      path,
      matches[0].number,
      "verified_at 必须为真实日期 YYYY-MM-DD",
    );
  }
  return `${match[2]}-${match[3]}-${match[4]}`;
}

export function parseCardDocument({
  path,
  source,
}: ParseCardDocumentInput): ParsedCardDocument {
  const parsed = (() => {
    try {
      return matter(source);
    } catch (error) {
      const marked = error as { mark?: { line?: unknown } };
      const markedLine = marked.mark?.line;
      const line =
        typeof markedLine === "number" && Number.isInteger(markedLine)
          ? markedLine + 1
          : 1;
      throw new CardFormatError(path, line, "Frontmatter YAML 格式非法");
    }
  })();
  const data = parsed.data as Record<string, unknown>;
  if (data.card_schema !== 1) {
    throw new CardFormatError(path, 1, "card_schema 必须为 1");
  }

  const category = requireString(data, "card_category", path);
  const topic = requireString(data, "card_topic", path);
  const variantValue = requireString(data, "card_variant", path);
  if (variantValue !== "full" && variantValue !== "sprint") {
    throw new CardFormatError(path, 1, "card_variant 必须为 full 或 sprint");
  }
  const variant: CardVariant = variantValue;
  const verifiedAt = requireVerifiedAt(source, path);

  const lines = parsed.content.split(/\r?\n/);
  const offset = frontmatterLineCount(source);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("%%card-id:") && !CARD_META_PATTERN.test(line)) {
      throw new CardFormatError(path, offset + index + 1, "card-id 格式非法");
    }
  }
  const cards: ParsedCardVariant[] = [];
  let pendingMetadata: CardMetadata | undefined;
  let ignoredSection = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const levelTwo = line.match(/^##\s+(.+)$/);
    if (levelTwo) {
      if (pendingMetadata) {
        throw new CardFormatError(
          path,
          pendingMetadata.line,
          "card-id 后缺少三级题目标题",
        );
      }
      ignoredSection = IGNORED_SECTION_PATTERN.test(levelTwo[1].trim());
      continue;
    }

    const metadataMatch = line.match(CARD_META_PATTERN);
    if (metadataMatch && !ignoredSection) {
      if (pendingMetadata) {
        throw new CardFormatError(
          path,
          pendingMetadata.line,
          "card-id 后缺少三级题目标题",
        );
      }
      pendingMetadata = {
        id: metadataMatch[1],
        priority: metadataMatch[2] as CardPriority,
        line: offset + index + 1,
      };
      continue;
    }

    const questionMatch = line.match(/^###\s+(.+?)\s*$/);
    if (!questionMatch || ignoredSection) {
      continue;
    }
    if (!pendingMetadata) {
      throw new CardFormatError(
        path,
        offset + index + 1,
        "三级标题缺少 card-id 元数据",
      );
    }

    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (
        /^#{2,3}\s+/.test(lines[cursor]) ||
        CARD_META_PATTERN.test(lines[cursor].trim())
      ) {
        end = cursor;
        break;
      }
    }
    cards.push(
      parseCardBody(lines.slice(index + 1, end), {
        path,
        line: offset + index + 1,
        metadata: pendingMetadata,
        question: questionMatch[1].trim(),
        category,
        topic,
        variant,
      }),
    );
    pendingMetadata = undefined;
    index = end - 1;
  }

  if (pendingMetadata) {
    throw new CardFormatError(
      path,
      pendingMetadata.line,
      "card-id 后缺少三级题目标题",
    );
  }

  return {
    schema: 1,
    category,
    topic,
    variant,
    verifiedAt,
    cards,
  };
}
