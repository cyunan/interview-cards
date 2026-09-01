import matter from "gray-matter";

import { CARD_ID_PATTERN } from "./card-id";
import type {
  CardDeck,
  CardPriority,
  FollowUpV1,
  ParsedCard,
  ParsedCardDocument,
} from "./types";

interface ParseCardDocumentInput {
  path: string;
  source: string;
}

interface CardMetadata {
  id: string;
  priority: CardPriority;
  decks: CardDeck[];
  legacyIds: string[];
  line: number;
}

const CARD_META_PATTERN =
  /^%%card-id:\s*([a-z0-9][a-z0-9-]{2,79});\s*priority:\s*(P[0-2]);\s*decks:\s*(full|sprint,full)%%$/;
const LEGACY_META_PATTERN = /^%%legacy-card-ids:\s*(.*?)%%$/;
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
  const value = lines.map((line) => line.replace(/^>\s?/, "")).join("\n").trim();
  return value.length > 0 ? value : undefined;
}

function extractCallout(
  lines: string[],
  type: "summary" | "tip" | "warning",
): { value?: string; indexes: Set<number> } {
  const indexes = new Set<number>();
  const marker = new RegExp(`^> \\[!${type}\\](?:[+-])?(?:\\s+.*)?$`, "i");
  for (let index = 0; index < lines.length; index += 1) {
    if (!marker.test(lines[index].trim())) continue;
    indexes.add(index);
    const content: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (!lines[cursor].trimStart().startsWith(">")) break;
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
  if (sectionStart < 0) return [];
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
    while (cursor < lines.length && !/^#{4,5}\s+/.test(lines[cursor])) {
      answer.push(lines[cursor]);
      cursor += 1;
    }
    followUps.push({ question: heading[1].trim(), answerMd: cleanQuotedMarkdown(answer) });
  }
  return followUps;
}

function extractDetail(lines: string[], excludedIndexes: Set<number>): string | undefined {
  const start = lines.findIndex((line) => /^####\s+深入理解\s*$/.test(line));
  if (start < 0) return undefined;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^####\s+高频追问\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return trimMarkdownLines(lines.slice(start + 1, end).filter((_, offset) => !excludedIndexes.has(start + 1 + offset)));
}

function plainTextLength(markdown: string): number {
  return markdown
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/[*_`#>\[\]()-]/g, "")
    .trim().length;
}

function parseLegacyIds(value: string, path: string, line: number): string[] {
  const ids = value.split(",").map((id) => id.trim());
  if (ids.length === 0 || ids.some((id) => !CARD_ID_PATTERN.test(id)) || new Set(ids).size !== ids.length) {
    throw new CardFormatError(path, line, "legacy-card-ids 格式非法或存在重复 legacy ID");
  }
  return ids;
}

function parseCardBody(
  lines: string[],
  context: { path: string; line: number; metadata: CardMetadata; question: string; category: string; topic: string },
): ParsedCard {
  if (lines.some((line) => /!\[\[|!\[[^\]]*\]\(/.test(line))) {
    throw new CardFormatError(context.path, context.line, "卡片内容不能包含图片");
  }
  const summary = extractCallout(lines, "summary");
  if (!summary.value) throw new CardFormatError(context.path, context.line, "缺少 [!summary] 30 秒回答");
  if (plainTextLength(summary.value) > 220) throw new CardFormatError(context.path, context.line, "30 秒回答超过 220 个字符");
  const projectHook = extractCallout(lines, "tip");
  const pitfalls = extractCallout(lines, "warning");
  const excluded = new Set([...summary.indexes, ...projectHook.indexes, ...pitfalls.indexes]);
  return {
    id: context.metadata.id,
    legacyIds: context.metadata.legacyIds,
    question: context.question,
    category: context.category,
    topic: context.topic,
    decks: context.metadata.decks,
    priority: context.metadata.priority,
    quickAnswerMd: summary.value,
    detailMd: extractDetail(lines, excluded),
    projectHookMd: projectHook.value,
    pitfallsMd: pitfalls.value,
    followUps: parseFollowUps(lines),
    source: { path: context.path, heading: context.question, line: context.line },
  };
}

function requireString(data: Record<string, unknown>, key: string, path: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new CardFormatError(path, 1, `Frontmatter 缺少 ${key}`);
  return value.trim();
}

function requireVerifiedAt(source: string, path: string): string {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) throw new CardFormatError(path, 1, "verified_at 必须为真实日期 YYYY-MM-DD");
  const lines = frontmatter[1].split(/\r?\n/);
  const matches = lines.map((line, index) => ({ line, number: index + 2 })).filter((entry) => /^verified_at\s*:/.test(entry.line));
  const match = matches[0]?.line.match(/^verified_at\s*:\s*(["']?)(\d{4})-(\d{2})-(\d{2})\1\s*$/);
  if (matches.length !== 1 || !match) throw new CardFormatError(path, matches[0]?.number ?? 1, "verified_at 必须为真实日期 YYYY-MM-DD");
  const year = Number(match[2]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) throw new CardFormatError(path, matches[0].number, "verified_at 必须为真实日期 YYYY-MM-DD");
  return `${match[2]}-${match[3]}-${match[4]}`;
}

export function parseCardDocument({ path, source }: ParseCardDocumentInput): ParsedCardDocument {
  const parsed = (() => {
    try { return matter(source); } catch (error) {
      const marked = error as { mark?: { line?: unknown } };
      const line = typeof marked.mark?.line === "number" && Number.isInteger(marked.mark.line) ? marked.mark.line + 1 : 1;
      throw new CardFormatError(path, line, "Frontmatter YAML 格式非法");
    }
  })();
  const data = parsed.data as Record<string, unknown>;
  if (data.card_schema !== 2) throw new CardFormatError(path, 1, "card_schema 必须为 2");
  if (Object.prototype.hasOwnProperty.call(data, "card_variant")) throw new CardFormatError(path, 1, "不允许文档级 card_variant");
  const category = requireString(data, "card_category", path);
  const topic = requireString(data, "card_topic", path);
  const verifiedAt = requireVerifiedAt(source, path);
  const lines = parsed.content.split(/\r?\n/);
  const offset = frontmatterLineCount(source);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("%%card-id:") && !CARD_META_PATTERN.test(line)) throw new CardFormatError(path, offset + index + 1, "card-id 格式非法");
    if (line.startsWith("%%legacy-card-ids:") && !LEGACY_META_PATTERN.test(line)) throw new CardFormatError(path, offset + index + 1, "legacy-card-ids 格式非法");
  }
  const cards: ParsedCard[] = [];
  let pendingMetadata: CardMetadata | undefined;
  let ignoredSection = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const levelTwo = line.match(/^##\s+(.+)$/);
    if (levelTwo) {
      if (pendingMetadata) throw new CardFormatError(path, pendingMetadata.line, "card-id 后缺少三级题目标题");
      ignoredSection = IGNORED_SECTION_PATTERN.test(levelTwo[1].trim());
      continue;
    }
    const metadataMatch = line.match(CARD_META_PATTERN);
    if (metadataMatch && !ignoredSection) {
      if (pendingMetadata) throw new CardFormatError(path, pendingMetadata.line, "card-id 后缺少三级题目标题");
      pendingMetadata = { id: metadataMatch[1], priority: metadataMatch[2] as CardPriority, decks: metadataMatch[3] === "full" ? ["full"] : ["sprint", "full"], legacyIds: [], line: offset + index + 1 };
      const next = lines[index + 1]?.trim();
      if (next?.startsWith("%%legacy-card-ids:")) {
        const legacyLine = offset + index + 2;
        const legacyMatch = next.match(LEGACY_META_PATTERN);
        if (!legacyMatch) throw new CardFormatError(path, legacyLine, "legacy-card-ids 格式非法");
        pendingMetadata.legacyIds = parseLegacyIds(legacyMatch[1], path, legacyLine);
        index += 1;
      }
      continue;
    }
    if (line.startsWith("%%legacy-card-ids:")) {
      throw new CardFormatError(path, offset + index + 1, "legacy-card-ids 必须紧跟 card-id 元数据");
    }
    const questionMatch = line.match(/^###\s+(.+?)\s*$/);
    if (!questionMatch || ignoredSection) continue;
    if (!pendingMetadata) throw new CardFormatError(path, offset + index + 1, "三级标题缺少 card-id 元数据");
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^#{2,3}\s+/.test(lines[cursor]) || CARD_META_PATTERN.test(lines[cursor].trim())) { end = cursor; break; }
    }
    cards.push(parseCardBody(lines.slice(index + 1, end), { path, line: offset + index + 1, metadata: pendingMetadata, question: questionMatch[1].trim(), category, topic }));
    pendingMetadata = undefined;
    index = end - 1;
  }
  if (pendingMetadata) throw new CardFormatError(path, pendingMetadata.line, "card-id 后缺少三级题目标题");
  return { schema: 2, category, topic, verifiedAt, cards };
}
