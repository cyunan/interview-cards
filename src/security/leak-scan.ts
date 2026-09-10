import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { CardV2, ParsedCard } from "../content/types";

export type LeakSource = Pick<
  CardV2 | ParsedCard,
  | "id"
  | "question"
  | "quickAnswerMd"
  | "detailMd"
  | "projectHookMd"
  | "pitfallsMd"
  | "followUps"
  | "source"
>;

export function buildLeakCorpus(
  sourceCards: ParsedCard[],
  cards: CardV2[],
): LeakSource[] {
  return [...sourceCards, ...cards];
}

export type LeakKind =
  | "card-question"
  | "card-answer"
  | "source-filename"
  | "email"
  | "phone"
  | "absolute-path";

export interface LeakFinding {
  file: string;
  kind: LeakKind;
  cardId?: string;
}

interface Fingerprint {
  kind: "card-question" | "card-answer" | "source-filename";
  value: string;
  cardId: string;
}

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "coverage",
  "playwright-report",
  "test-results",
]);
const CONTACT_EXEMPT_FILENAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
]);
const BINARY_FILENAMES = new Set([".DS_Store"]);
const BINARY_EXTENSIONS = new Set([
  ".avi",
  ".br",
  ".db",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lockb",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".sqlite",
  ".ttf",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

export interface GitHistoryText {
  path: string;
  text: string;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function answerLines(card: LeakSource): string[] {
  const fields = [
    card.quickAnswerMd,
    card.detailMd,
    card.projectHookMd,
    card.pitfallsMd,
    ...card.followUps.map((followUp) => followUp.answerMd),
  ].filter((value): value is string => typeof value === "string");
  const completeFields = fields.map(normalize).filter(Boolean);
  const lineFragments = fields
    .flatMap((value) => value.split(/\r?\n/))
    .map(normalize)
    // Very short code fragments such as `return true;` are common in the
    // application itself and are not useful plaintext fingerprints. Complete
    // answer fields remain fingerprints even when they are short.
    .filter((value) => value.length >= 24);
  return [...new Set([...completeFields, ...lineFragments])];
}

function fingerprints(cards: LeakSource[]): Fingerprint[] {
  const values: Fingerprint[] = [];
  for (const card of cards) {
    const question = normalize(card.question);
    if (question.length > 0) {
      values.push({ kind: "card-question", value: question, cardId: card.id });
    }
    for (const followUp of card.followUps) {
      const followUpQuestion = normalize(followUp.question);
      if (followUpQuestion.length > 0) {
        values.push({
          kind: "card-question",
          value: followUpQuestion,
          cardId: card.id,
        });
      }
    }
    for (const answer of answerLines(card)) {
      values.push({ kind: "card-answer", value: answer, cardId: card.id });
    }
    const filename = path.posix.basename(card.source.path);
    if (filename.length >= 6) {
      values.push({
        kind: "source-filename",
        value: filename,
        cardId: card.id,
      });
    }
  }
  return values;
}

async function listTextFiles(root: string): Promise<string[]> {
  try {
    const info = await stat(root);
    if (info.isFile()) {
      return isScannableTextPath(root) ? [root] : [];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRECTORIES.has(entry.name) ? [] : listTextFiles(absolute);
      }
      return entry.name !== ".git" && entry.isFile() &&
        isScannableTextPath(entry.name)
        ? [absolute]
        : [];
    }),
  );
  return files.flat();
}

export function isScannableTextPath(pathname: string): boolean {
  return (
    !BINARY_FILENAMES.has(path.basename(pathname)) &&
    !BINARY_EXTENSIONS.has(path.extname(pathname).toLowerCase())
  );
}

function isContactExemptFile(file: string): boolean {
  const logicalPath = file.startsWith("git-history:")
    ? file.slice("git-history:".length)
    : file;
  return CONTACT_EXEMPT_FILENAMES.has(path.basename(logicalPath));
}

function pushUnique(findings: LeakFinding[], finding: LeakFinding): void {
  if (
    !findings.some(
      (current) =>
        current.file === finding.file &&
        current.kind === finding.kind &&
        current.cardId === finding.cardId,
    )
  ) {
    findings.push(finding);
  }
}

function scanTextWithFingerprints(
  file: string,
  text: string,
  cardFingerprints: Fingerprint[],
): LeakFinding[] {
  if (text.includes("\u0000")) {
    return [];
  }
  const findings: LeakFinding[] = [];
  const normalizedText = normalize(text);
  for (const fingerprint of cardFingerprints) {
    if (normalizedText.includes(fingerprint.value)) {
      pushUnique(findings, {
        file,
        kind: fingerprint.kind,
        cardId: fingerprint.cardId,
      });
    }
  }

  if (!isContactExemptFile(file)) {
    const contactText = text.replace(
      /[A-Z0-9._%+-]+@users\.noreply\.github\.com/gi,
      "",
    );
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(contactText)) {
      pushUnique(findings, { file, kind: "email" });
    }
    if (/(?:^|\D)1[3-9]\d{9}(?:\D|$)/m.test(text)) {
      pushUnique(findings, { file, kind: "phone" });
    }
  }
  if (/(?:\/Users\/[^\s"'`]+|[A-Za-z]:\\Users\\[^\s"'`]+)/.test(text)) {
    pushUnique(findings, { file, kind: "absolute-path" });
  }
  return findings;
}

export function scanTextForPlaintextLeaks(
  file: string,
  text: string,
  cards: LeakSource[],
): LeakFinding[] {
  return scanTextWithFingerprints(file, text, fingerprints(cards));
}

export function scanGitHistoryLeaks(
  metadata: string,
  entries: GitHistoryText[],
  cards: LeakSource[],
): LeakFinding[] {
  const cardFingerprints = fingerprints(cards);
  const findings = scanTextWithFingerprints(
    "git-history",
    metadata,
    cardFingerprints,
  );
  for (const entry of entries) {
    if (!isScannableTextPath(entry.path)) {
      continue;
    }
    for (const finding of scanTextWithFingerprints(
      `git-history:${entry.path}`,
      `${entry.path}\n${entry.text}`,
      cardFingerprints,
    )) {
      pushUnique(findings, finding);
    }
  }
  return findings;
}

export async function scanForPlaintextLeaks(
  roots: string[],
  cards: LeakSource[],
): Promise<LeakFinding[]> {
  const cardFingerprints = fingerprints(cards);
  const files = (
    await Promise.all(roots.map((root) => listTextFiles(path.resolve(root))))
  )
    .flat()
    .sort();
  const findings: LeakFinding[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const finding of scanTextWithFingerprints(
      file,
      text,
      cardFingerprints,
    )) {
      pushUnique(findings, finding);
    }
  }

  return findings;
}
