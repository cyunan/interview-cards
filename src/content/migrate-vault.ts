import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { mergeCardVariants } from "./merge";
import { migrateCardDocument, normalizeQuestionKey } from "./migrate";
import { parseCardDocument } from "./parser";
import type { CardV1, ParsedCardVariant } from "./types";
import { discoverCardFiles } from "./vault";

export interface PreparedMigrationDocument {
  path: string;
  source: string;
}

export interface VaultMigrationPlan {
  documents: PreparedMigrationDocument[];
  cards: CardV1[];
  report: {
    documents: number;
    variants: number;
    cards: number;
    warnings: string[];
  };
}

function isSprintPath(relativePath: string): boolean {
  return relativePath.startsWith("00-个人资料/简历技术点/速记-");
}

function isAlreadyMigrated(source: string): boolean {
  return /^card_schema:\s*1\s*$/m.test(source) && /^%%card-id:/m.test(source);
}

async function prepareOne(
  vaultRoot: string,
  relativePath: string,
  verifiedAt: string,
  knownIdsByQuestion: Map<string, string>,
): Promise<{
  document: PreparedMigrationDocument;
  variants: ParsedCardVariant[];
  warnings: string[];
}> {
  const source = await readFile(path.join(vaultRoot, relativePath), "utf8");
  const migrated = isAlreadyMigrated(source)
    ? { source, warnings: [] }
    : migrateCardDocument({
        path: relativePath,
        source,
        verifiedAt,
        knownIdsByQuestion,
      });
  const parsed = parseCardDocument({ path: relativePath, source: migrated.source });
  if (parsed.cards.length === 0) {
    throw new Error(`${relativePath}: 没有可生成的卡片`);
  }

  for (const card of parsed.cards) {
    knownIdsByQuestion.set(normalizeQuestionKey(card.question), card.id);
  }

  return {
    document: { path: relativePath, source: migrated.source },
    variants: parsed.cards,
    warnings: migrated.warnings,
  };
}

export async function prepareVaultMigration(
  vaultRoot: string,
  verifiedAt: string,
): Promise<VaultMigrationPlan> {
  const files = await discoverCardFiles(vaultRoot);
  const orderedFiles = [
    ...files.filter((file) => !isSprintPath(file)),
    ...files.filter(isSprintPath),
  ];
  const knownIdsByQuestion = new Map<string, string>();
  const prepared: Awaited<ReturnType<typeof prepareOne>>[] = [];

  for (const relativePath of orderedFiles) {
    prepared.push(
      await prepareOne(vaultRoot, relativePath, verifiedAt, knownIdsByQuestion),
    );
  }

  const variants = prepared.flatMap((entry) => entry.variants);
  const cards = mergeCardVariants(variants);
  const documents = prepared
    .map((entry) => entry.document)
    .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));

  return {
    documents,
    cards,
    report: {
      documents: documents.length,
      variants: variants.length,
      cards: cards.length,
      warnings: prepared.flatMap((entry) => entry.warnings),
    },
  };
}

export async function writeVaultMigration(
  vaultRoot: string,
  verifiedAt: string,
): Promise<VaultMigrationPlan> {
  const plan = await prepareVaultMigration(vaultRoot, verifiedAt);
  await Promise.all(
    plan.documents.map((document) =>
      writeFile(path.join(vaultRoot, document.path), document.source, "utf8"),
    ),
  );
  return plan;
}
