import matter from "gray-matter";

import type { CardPriority, CardVariant } from "./types";

interface MigrateCardDocumentInput {
  path: string;
  source: string;
  verifiedAt: string;
  knownIdsByQuestion: Map<string, string>;
}

export interface MigratedCardDocument {
  source: string;
  cardIds: string[];
  warnings: string[];
}

const IGNORED_LEVEL_TWO = /^(?:使用说明|参考资料|导航|附：?相关资料)/;
const NON_CARD_HEADING = /(?:复习时应该|先看哪几节|使用说明|导航|参考资料)/;

const SPRINT_CATEGORY_BY_NUMBER: Record<string, string> = {
  "01": "04-JVM",
  "02": "01-Kotlin",
  "03": "02-Android",
  "04": "02-Android",
  "05": "02-Android",
  "06": "02-Android",
  "07": "05-设计模式",
  "08": "02-Android",
  "09": "02-Android",
  "10": "08-跨端与扩展技术",
  "11": "08-跨端与扩展技术",
  "12": "08-跨端与扩展技术",
  "13": "01-Kotlin",
  "14": "09-岗位专项",
  "15": "06-网络",
};

const CATEGORY_SLUGS: Record<string, string> = {
  "01-Kotlin": "kotlin",
  "02-Android": "android",
  "03-开源框架": "framework",
  "04-JVM": "jvm",
  "05-设计模式": "design",
  "06-网络": "network",
  "07-操作系统": "os",
  "08-跨端与扩展技术": "extended",
  "08-算法与综合": "algorithm",
  "09-岗位专项": "role",
  "09-场景题": "scenario",
};

function stripQuestionNumber(value: string): string {
  return value
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^Q\s*\d+(?:\.\d+)*\s*[:：.、-]?\s*/i, "")
    .replace(/^(?:第?[一二三四五六七八九十百]+[、.．]|\d+(?:\.\d+)*[、.．]?)[ \t]*/, "")
    .trim();
}

export function normalizeQuestionKey(question: string): string {
  return stripQuestionNumber(question)
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[？?！!。．.：:；;、，,]+$/g, "");
}

function detectVariant(path: string): CardVariant {
  return /(?:^|\/)速记-[^/]+\.md$/.test(path) ? "sprint" : "full";
}

function detectCategory(path: string, variant: CardVariant): string {
  if (variant === "full") {
    const match = path.match(/^09-面试题整理\/([^/]+)\//);
    return match?.[1] ?? "09-岗位专项";
  }

  const sprintNumber = path.match(/\/速记-(\d{2})-/)?.[1];
  return sprintNumber ? (SPRINT_CATEGORY_BY_NUMBER[sprintNumber] ?? "09-岗位专项") : "09-岗位专项";
}

function detectTopic(path: string, content: string): string {
  const title = content.match(/^#\s+(.+?)\s*$/m)?.[1]
    .replace(/\s*[·｜|]\s*面试(?:题清单|速记).*$/u, "")
    .replace(/\s*·\s*面试题清单$/u, "")
    .replace(/\s*面试题清单$/u, "")
    .trim();
  if (title) {
    return title;
  }

  const filename = path.split("/").at(-1) ?? "综合";
  return filename
    .replace(/\.md$/, "")
    .replace(/^速记-\d{2}-/, "")
    .replace(/-面试题清单$/, "");
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function topicSlug(topic: string): string | undefined {
  const words = topic.toLocaleLowerCase("en-US").match(/[a-z][a-z0-9]*/g);
  if (!words?.length) {
    return undefined;
  }
  return [...new Set(words)].join("-").slice(0, 36).replace(/-+$/g, "");
}

function idPrefix(category: string, topic: string, path: string): string {
  const categorySlug = CATEGORY_SLUGS[category] ?? "general";
  return `${categorySlug}-${topicSlug(topic) ?? stableHash(path)}`;
}

function allocateCardId(
  prefix: string,
  question: string,
  knownIdsByQuestion: Map<string, string>,
  usedIds: Set<string>,
  sequence: { value: number },
): string {
  const questionKey = normalizeQuestionKey(question);
  const knownId = knownIdsByQuestion.get(questionKey);
  if (knownId) {
    usedIds.add(knownId);
    return knownId;
  }

  let candidate: string;
  do {
    candidate = `${prefix}-${String(sequence.value).padStart(3, "0")}`;
    sequence.value += 1;
  } while (usedIds.has(candidate));

  knownIdsByQuestion.set(questionKey, candidate);
  usedIds.add(candidate);
  return candidate;
}

function stripThirtySecondMarker(line: string): string | undefined {
  const match = line.match(
    /^\s*(?:[-+*]\s*)?(?:>\s*)?\*\*30\s*秒答(?:案)?\*\*[：:]\s*(.+?)\s*$/,
  );
  return match?.[1]?.trim();
}

function cleanSummaryLine(line: string): string {
  return line
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*[-+*]\s+/, "")
    .trim();
}

function plainText(markdown: string): string {
  return markdown
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/[*_`#>\[\]()]/g, "")
    .trim();
}

function truncateSummary(summary: string): { value: string; truncated: boolean } {
  if (plainText(summary).length <= 220) {
    return { value: summary, truncated: false };
  }

  let value = summary;
  while (plainText(value).length > 217 && value.length > 1) {
    value = value.slice(0, -1);
  }
  const sentenceEnd = Math.max(
    value.lastIndexOf("。"),
    value.lastIndexOf("；"),
    value.lastIndexOf("！"),
    value.lastIndexOf("？"),
  );
  if (sentenceEnd >= Math.floor(value.length * 0.55)) {
    value = value.slice(0, sentenceEnd + 1);
  } else {
    value = `${value.trimEnd()}…`;
  }
  return { value, truncated: true };
}

function deriveSummary(answerLines: string[]): { value: string; truncated: boolean } {
  for (const line of answerLines) {
    const marked = stripThirtySecondMarker(line);
    if (marked) {
      return truncateSummary(marked);
    }
  }

  const paragraphs = answerLines.join("\n").split(/\n\s*\n/);
  const firstParagraph = paragraphs
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map(cleanSummaryLine)
        .filter(Boolean)
        .join(" "),
    )
    .find((paragraph) => paragraph.length > 0 && !/^---+$/.test(paragraph));
  return truncateSummary(firstParagraph ?? "待补充回答。");
}

function quoteCallout(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

function extractReferences(source: string): string[] {
  const references: string[] = [];
  for (const match of source.matchAll(/\[\[([^\]]+)\]\]/g)) {
    if (match.index !== undefined && source[match.index - 1] === "!") {
      continue;
    }
    const target = match[1].trim();
    const display = target.includes("|") ? target.split("|").at(-1) ?? target : target;
    if (/面试题索引|面试前技术点速记|简历一页版|^02-Android\/$/.test(target)) {
      continue;
    }
    if (!references.some((reference) => reference === target || reference.endsWith(`|${display}`))) {
      references.push(target);
    }
  }
  return references;
}

function removeImageDependencies(
  content: string,
  path: string,
): { content: string; warnings: string[] } {
  let removed = 0;
  const sanitized = content
    .split(/\r?\n/)
    .map((line) =>
      line.replace(/!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/g, () => {
        removed += 1;
        return "";
      }),
    )
    .join("\n");

  return {
    content: sanitized,
    warnings:
      removed > 0 ? [`${path}: 已移除图片依赖 ${removed} 处，请确认文字说明完整`] : [],
  };
}

function appendReferenceSection(content: string, references: string[]): string {
  if (/^##\s+参考资料\s*$/m.test(content) || references.length === 0) {
    return content.trimEnd();
  }
  const items = references.map((reference) => `- [[${reference}]]`).join("\n");
  return `${content.trimEnd()}\n\n## 参考资料\n\n${items}`;
}

function migrateContent(options: {
  content: string;
  category: string;
  topic: string;
  variant: CardVariant;
  path: string;
  knownIdsByQuestion: Map<string, string>;
}): { content: string; cardIds: string[]; warnings: string[] } {
  const lines = options.content.split(/\r?\n/);
  const prefix = idPrefix(options.category, options.topic, options.path);
  const sequence = { value: 1 };
  const usedIds = new Set(options.knownIdsByQuestion.values());
  const cardIds: string[] = [];
  const warnings: string[] = [];
  const output: string[] = [];
  let ignoredSection = false;

  for (let index = 0; index < lines.length; index += 1) {
    const levelTwo = lines[index].match(/^##\s+(.+?)\s*$/);
    if (levelTwo) {
      ignoredSection = IGNORED_LEVEL_TWO.test(levelTwo[1].trim());
      output.push(lines[index]);
      continue;
    }

    const heading = lines[index].match(/^###\s+(.+?)\s*$/);
    if (!heading || ignoredSection) {
      output.push(lines[index]);
      continue;
    }

    const rawQuestion = heading[1].trim();
    if (NON_CARD_HEADING.test(rawQuestion)) {
      output.push(`#### ${rawQuestion}`);
      continue;
    }

    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^#{2,3}\s+/.test(lines[cursor])) {
        end = cursor;
        break;
      }
    }
    const answerLines = lines.slice(index + 1, end);
    const question = stripQuestionNumber(rawQuestion);
    const questionKey = normalizeQuestionKey(question);
    const existingId = options.knownIdsByQuestion.get(questionKey);
    if (options.variant === "full" && existingId) {
      const originalAnswer = answerLines.join("\n").trim();
      output.push(`%%card-ref: ${existingId}%%`);
      output.push(`#### ${question}`);
      output.push("");
      output.push(`> [!note] 主卡引用：\`${existingId}\``);
      if (originalAnswer) {
        output.push("");
        output.push(originalAnswer);
      }
      warnings.push(
        `${options.path}:${index + 1} 重复完整题已改为 card-ref: ${existingId}`,
      );
      index = end - 1;
      continue;
    }
    const id = allocateCardId(
      prefix,
      question,
      options.knownIdsByQuestion,
      usedIds,
      sequence,
    );
    const priority: CardPriority = options.variant === "sprint" ? "P0" : "P1";
    const summary = deriveSummary(answerLines);
    if (summary.truncated) {
      warnings.push(`${options.path}:${index + 1} 30 秒回答已自动截断，请人工复核`);
    }

    const originalAnswer = answerLines.join("\n").trim();
    output.push(`%%card-id: ${id}; priority: ${priority}%%`);
    output.push(`### ${question}`);
    output.push("");
    output.push("> [!summary] 30 秒回答");
    output.push(quoteCallout(summary.value));
    if (originalAnswer) {
      output.push("");
      output.push("#### 展开要点");
      output.push("");
      output.push(originalAnswer);
    }
    cardIds.push(id);
    index = end - 1;
  }

  return { content: output.join("\n"), cardIds, warnings };
}

export function migrateCardDocument({
  path,
  source,
  verifiedAt,
  knownIdsByQuestion,
}: MigrateCardDocumentInput): MigratedCardDocument {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) {
    throw new Error("verifiedAt 必须为 YYYY-MM-DD");
  }

  const parsed = matter(source);
  const variant = detectVariant(path);
  const category = detectCategory(path, variant);
  const topic = detectTopic(path, parsed.content);
  const sanitized = removeImageDependencies(parsed.content, path);
  const migrated = migrateContent({
    content: sanitized.content,
    category,
    topic,
    variant,
    path,
    knownIdsByQuestion,
  });
  const contentWithReferences = appendReferenceSection(
    migrated.content,
    extractReferences(source),
  );
  const data = {
    ...parsed.data,
    card_schema: 1,
    card_category: category,
    card_topic: topic,
    card_variant: variant,
    verified_at: verifiedAt,
  };

  return {
    source: matter.stringify(`${contentWithReferences.trim()}\n`, data),
    cardIds: migrated.cardIds,
    warnings: [...sanitized.warnings, ...migrated.warnings],
  };
}
