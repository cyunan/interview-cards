import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { compileVault } from "../src/content/vault";
import { parseVaultArgument } from "../src/publish/args";
import {
  buildLeakCorpus,
  isScannableTextPath,
  scanForPlaintextLeaks,
  scanGitHistoryLeaks,
  type GitHistoryText,
} from "../src/security/leak-scan";

const execFile = promisify(execFileCallback);

async function runGit(repositoryRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFile("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
  return stdout;
}

async function readReachableHistory(
  repositoryRoot: string,
): Promise<{ metadata: string; entries: GitHistoryText[] }> {
  const [metadata, commitList] = await Promise.all([
    runGit(repositoryRoot, ["log", "--all", "--format=fuller", "--no-patch"]),
    runGit(repositoryRoot, ["rev-list", "--all"]),
  ]);
  const blobs = new Map<string, { hash: string; path: string }>();
  for (const commit of commitList.split(/\r?\n/).filter(Boolean)) {
    const tree = await runGit(repositoryRoot, [
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      commit,
    ]);
    for (const record of tree.split("\u0000").filter(Boolean)) {
      const separator = record.indexOf("\t");
      if (separator < 0) continue;
      const [mode, type, hash] = record.slice(0, separator).split(" ");
      const pathname = record.slice(separator + 1);
      if (mode && type === "blob" && hash && isScannableTextPath(pathname)) {
        blobs.set(`${hash}\u0000${pathname}`, { hash, path: pathname });
      }
    }
  }

  const entries: GitHistoryText[] = [];
  for (const blob of blobs.values()) {
    entries.push({
      path: blob.path,
      text: await runGit(repositoryRoot, ["cat-file", "blob", blob.hash]),
    });
  }
  return { metadata, entries };
}

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const vaultRoot = path.resolve(parseVaultArgument(process.argv.slice(2)));
  const { cards, sourceVariants } = await compileVault(vaultRoot);
  const leakCorpus = buildLeakCorpus(sourceVariants, cards);
  const workingTreeFindings = await scanForPlaintextLeaks(
    [repositoryRoot, path.join(repositoryRoot, "dist")],
    leakCorpus,
  );
  const history = await readReachableHistory(repositoryRoot);
  const findings = [
    ...workingTreeFindings,
    ...scanGitHistoryLeaks(history.metadata, history.entries, leakCorpus),
  ];

  if (findings.length > 0) {
    const lines = findings.map((finding) => {
      const file = path.relative(repositoryRoot, finding.file) || ".";
      const card = finding.cardId ? ` (${finding.cardId})` : "";
      return `- ${file}: ${finding.kind}${card}`;
    });
    throw new Error(`发现公开仓库明文风险：\n${lines.join("\n")}`);
  }

  process.stdout.write("工作树与可达 Git 历史明文泄漏扫描通过。\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "明文泄漏扫描失败"}\n`);
  process.exitCode = 1;
});
