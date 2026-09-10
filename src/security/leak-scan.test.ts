import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CardV2, ParsedCard } from "../content/types";
import {
  buildLeakCorpus,
  scanForPlaintextLeaks,
  scanGitHistoryLeaks,
  scanTextForPlaintextLeaks,
} from "./leak-scan";

const roots: string[] = [];
const card: CardV2 = {
  id: "android-quantum-widget-001",
  legacyIds: [],
  question: "QuantumWidget 的熵门如何工作？",
  category: "02-Android",
  topic: "QuantumWidget",
  decks: ["full"],
  priority: "P1",
  quickAnswerMd: "熵门通过虚构的量子锁保护测试状态。",
  followUps: [],
  source: {
    path: "09-面试题整理/02-Android/QuantumWidget-面试题清单.md",
    heading: "QuantumWidget 的熵门如何工作？",
  },
};

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "cards-leak-scan-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("scanForPlaintextLeaks", () => {
  it("accepts app code and ciphertext without card plaintext", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, "public"));
    await writeFile(path.join(root, "app.ts"), "export const title = '面试卡片';");
    await writeFile(path.join(root, "public", "cards.enc.json"), "QUJDREVGRw==");

    await expect(scanForPlaintextLeaks([root], [card])).resolves.toEqual([]);
  });

  it("scans dotfiles and extensionless text files", async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, ".env"), card.question);
    await writeFile(path.join(root, ".nvmrc"), card.quickAnswerMd);

    const findings = await scanForPlaintextLeaks([root], [card]);
    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["card-question", "card-answer"]),
    );
  });

  it("ignores local worktree state that is excluded from the public repository", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, ".worktrees", "scratch"), { recursive: true });
    await writeFile(path.join(root, ".worktrees", "scratch", "server-info"), card.question);

    await expect(scanForPlaintextLeaks([root], [card])).resolves.toEqual([]);
  });

  it("detects questions, answers, source filenames, contact data, and local paths", async () => {
    const root = await makeRoot();
    await writeFile(
      path.join(root, "leak.txt"),
      [
        card.question,
        card.quickAnswerMd,
        "QuantumWidget-面试题清单.md",
        ["person", "example.com"].join("@"),
        ["138", "0013", "8000"].join(""),
        ["/Users", "someone/private.md"].join("/"),
      ].join("\n"),
    );

    const findings = await scanForPlaintextLeaks([root], [card]);
    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining([
        "card-question",
        "card-answer",
        "source-filename",
        "email",
        "phone",
        "absolute-path",
      ]),
    );
  });

  it("scans reachable history text while allowing a GitHub noreply author", () => {
    const safe = scanTextForPlaintextLeaks(
      "git-history",
      "Author: cyunan <12345+cyunan@users.noreply.github.com>",
      [card],
    );
    expect(safe).toEqual([]);

    expect(
      scanTextForPlaintextLeaks(
        "git-history",
        `Author: person <${["person", "example.com"].join("@")}>\n+${card.question}`,
        [card],
      ).map((finding) => finding.kind),
    ).toEqual(expect.arrayContaining(["email", "card-question"]));
  });

  it("skips dependency lockfile metadata while scanning versioned source blobs", () => {
    const findings = scanGitHistoryLeaks(
      "Author: cyunan <12345+cyunan@users.noreply.github.com>",
      [
        {
          path: "package-lock.json",
          text: `dependency contact: ${["i", "izs.me"].join("@")}\n${card.question}`,
        },
        { path: "src/card.ts", text: card.question },
      ],
      [card],
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "git-history:package-lock.json",
          kind: "card-question",
        }),
        expect.objectContaining({
          file: "git-history:src/card.ts",
          kind: "card-question",
        }),
      ]),
    );
    expect(findings.some((finding) => finding.kind === "email")).toBe(false);
  });

  it("scans dotfiles in reachable history", () => {
    const findings = scanGitHistoryLeaks(
      "Author: cyunan <12345+cyunan@users.noreply.github.com>",
      [{ path: ".env", text: card.question }],
      [card],
    );

    expect(findings).toEqual([
      expect.objectContaining({
        file: "git-history:.env",
        kind: "card-question",
      }),
    ]);
  });

  it("detects plaintext from a source variant that the published merge drops", () => {
    const droppedVariant: ParsedCard = {
      id: card.id,
      legacyIds: [],
      question: "完整版本独有的虚构问题是什么？",
      category: card.category,
      topic: card.topic,
      decks: ["full"],
      priority: card.priority,
      quickAnswerMd: "这是合并后不会发布的完整版本独有回答。",
      followUps: [
        {
          question: "完整版本独有的追问是什么？",
          answerMd: "这是完整版本独有的追问回答。",
        },
      ],
      source: {
        path: "09-面试题整理/02-Android/完整版本独有-面试题清单.md",
        heading: "完整版本独有的虚构问题是什么？",
        line: 12,
      },
    };

    const findings = scanGitHistoryLeaks(
      "Author: cyunan <12345+cyunan@users.noreply.github.com>",
      [
        {
          path: "src/old-card.ts",
          text: [
            droppedVariant.quickAnswerMd,
            droppedVariant.followUps[0].question,
            "完整版本独有-面试题清单.md",
          ].join("\n"),
        },
      ],
      [card, droppedVariant],
    );

    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["card-question", "card-answer", "source-filename"]),
    );
  });

  it("detects normalized merged text as well as raw source wikilinks", () => {
    const linkedVariant: ParsedCard = {
      id: card.id,
      legacyIds: [],
      question: "[[私有路径/熵门|熵门]]如何工作？",
      category: card.category,
      topic: card.topic,
      decks: ["full"],
      priority: card.priority,
      quickAnswerMd: "通过[[私有路径/量子锁|量子锁]]保护完整的虚构测试状态。",
      followUps: [],
      source: { ...card.source, line: 12 },
    };
    const normalizedCard: CardV2 = {
      ...card,
      question: "熵门如何工作？",
      quickAnswerMd: "通过量子锁保护完整的虚构测试状态。",
    };

    const findings = scanGitHistoryLeaks(
      "Author: cyunan <12345+cyunan@users.noreply.github.com>",
      [
        {
          path: "src/old-card.ts",
          text: `${normalizedCard.question}\n${normalizedCard.quickAnswerMd}`,
        },
      ],
      buildLeakCorpus([linkedVariant], [normalizedCard]),
    );

    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["card-question", "card-answer"]),
    );
  });

  it("fingerprints short complete questions and answers at the corpus boundary", () => {
    const shortCard: CardV2 = {
      ...card,
      id: "android-short-boundary-001",
      question: "为何会卡顿",
      quickAnswerMd: "会阻塞。",
      source: { ...card.source, heading: "为何会卡顿" },
    };

    const findings = scanTextForPlaintextLeaks(
      "src/old-card.ts",
      `${shortCard.question}\n${shortCard.quickAnswerMd}`,
      [shortCard],
    );

    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["card-question", "card-answer"]),
    );
  });

  it("does not treat generic short code lines as answer leaks", () => {
    const codeCard: CardV2 = {
      ...card,
      id: "android-generic-code-001",
      quickAnswerMd: "这是一个不会出现在源码里的完整回答。",
      detailMd: "return true;\nreturn false;",
    };

    const findings = scanTextForPlaintextLeaks(
      "src/normal-code.ts",
      "return true;",
      [codeCard],
    );

    expect(findings).toEqual([]);
  });
});
