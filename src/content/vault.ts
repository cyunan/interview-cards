import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { mergeCardVariants } from "./merge";
import { CardFormatError, parseCardDocument } from "./parser";
import type {
  CardPriority,
  CardV1,
  ParsedCardDocument,
  ParsedCardVariant,
} from "./types";

export interface CompileReport {
  documents: number;
  documentsByVariant: { sprint: number; full: number };
  variants: number;
  cards: number;
  byDeck: { sprint: number; full: number };
  byPriority: Record<CardPriority, number>;
  byCategory: Record<string, number>;
}

export interface CompiledVault {
  cards: CardV1[];
  sourceVariants: ParsedCardVariant[];
  report: CompileReport;
}

interface SourceReference {
  id: string;
  path: string;
  line: number;
}

const CARD_REF_PATTERN = /^%%card-ref:\s*([a-z0-9][a-z0-9-]{2,79})%%$/;

function inspectDocumentSource(
  relativePath: string,
  source: string,
): SourceReference[] {
  const references: SourceReference[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/.test(line)) {
      throw new CardFormatError(
        relativePath,
        index + 1,
        "卡片文档不能包含图片",
      );
    }
    const withoutValidWikilinks = line.replace(/\[\[[^\]\r\n]+\]\]/g, "");
    if (
      withoutValidWikilinks.includes("[[") ||
      withoutValidWikilinks.includes("]]")
    ) {
      throw new CardFormatError(
        relativePath,
        index + 1,
        "存在未解析的 Obsidian 双链",
      );
    }
    if (!line.trim().startsWith("%%card-ref:")) {
      continue;
    }
    const match = line.trim().match(CARD_REF_PATTERN);
    if (!match) {
      throw new CardFormatError(relativePath, index + 1, "card-ref 格式非法");
    }
    references.push({ id: match[1], path: relativePath, line: index + 1 });
  }
  return references;
}

async function walkMarkdown(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkMarkdown(absolute);
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [absolute] : [];
    }),
  );
  return files.flat();
}

async function existingMarkdown(directory: string): Promise<string[]> {
  try {
    return await walkMarkdown(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function discoverCardFiles(vaultRoot: string): Promise<string[]> {
  const interviewRoot = path.join(vaultRoot, "09-面试题整理");
  const sprintRoot = path.join(vaultRoot, "00-个人资料", "简历技术点");
  const [interviewFiles, sprintFiles] = await Promise.all([
    existingMarkdown(interviewRoot),
    existingMarkdown(sprintRoot),
  ]);

  return [
    ...interviewFiles.filter((absolute) =>
      path.basename(absolute).endsWith("面试题清单.md"),
    ),
    ...sprintFiles.filter((absolute) =>
      /^速记-.*\.md$/.test(path.basename(absolute)),
    ),
  ]
    .map((absolute) => path.relative(vaultRoot, absolute).split(path.sep).join("/"))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function buildReport(
  documents: ParsedCardDocument[],
  variants: ParsedCardVariant[],
  cards: CardV1[],
): CompileReport {
  const byCategory: Record<string, number> = {};
  const byPriority: Record<CardPriority, number> = { P0: 0, P1: 0, P2: 0 };
  const byDeck = { sprint: 0, full: 0 };
  const documentsByVariant = { sprint: 0, full: 0 };

  for (const document of documents) {
    documentsByVariant[document.variant] += 1;
  }

  for (const card of cards) {
    byCategory[card.category] = (byCategory[card.category] ?? 0) + 1;
    byPriority[card.priority] += 1;
    for (const deck of card.decks) {
      byDeck[deck] += 1;
    }
  }

  return {
    documents: documents.length,
    documentsByVariant,
    variants: variants.length,
    cards: cards.length,
    byDeck,
    byPriority,
    byCategory,
  };
}

export async function compileVault(vaultRoot: string): Promise<CompiledVault> {
  const files = await discoverCardFiles(vaultRoot);
  const loadResults = await Promise.allSettled(
    files.map(async (relativePath) => {
      const source = await readFile(path.join(vaultRoot, relativePath), "utf8");
      const references = inspectDocumentSource(relativePath, source);
      const document = parseCardDocument({ path: relativePath, source });
      const expectedVariant = relativePath.startsWith(
        "00-个人资料/简历技术点/",
      )
        ? "sprint"
        : "full";
      if (document.variant !== expectedVariant) {
        throw new CardFormatError(
          relativePath,
          1,
          `card_variant 必须为 ${expectedVariant}`,
        );
      }
      if (document.cards.length === 0) {
        throw new CardFormatError(relativePath, 1, "没有可生成的卡片");
      }
      return {
        document,
        references,
      };
    }),
  );
  for (const result of loadResults) {
    if (result.status === "rejected") {
      throw result.reason;
    }
  }
  const loaded = loadResults.map((result) => {
    if (result.status !== "fulfilled") {
      throw new Error("卡片文档加载状态异常");
    }
    return result.value;
  });
  const documents = loaded.map((entry) => entry.document);
  const variants = documents.flatMap((document) => document.cards);
  const cards = mergeCardVariants(variants);
  const cardIds = new Set(cards.map((card) => card.id));
  for (const reference of loaded.flatMap((entry) => entry.references)) {
    if (!cardIds.has(reference.id)) {
      throw new CardFormatError(
        reference.path,
        reference.line,
        `card-ref 指向不存在的卡片 ${reference.id}`,
      );
    }
  }

  return {
    cards,
    sourceVariants: variants,
    report: buildReport(documents, variants, cards),
  };
}
