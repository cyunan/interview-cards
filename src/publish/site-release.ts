import { execFile as callback, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rename, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { encryptEnvelope } from "../crypto/envelope";
import type { CompiledSite } from "../content/single-source";
import { membership, membershipChanges, type MembershipEntry } from "../content/single-source";
import { scanForPlaintextLeaks, scanGitHistoryLeaks, isScannableTextPath, type GitHistoryText, type LeakSource } from "../security/leak-scan";
import { REFERENCE_DOCUMENT_MANIFEST } from "../content/reference-docs";
const execFile = promisify(callback);
export async function git(root: string, args: string[]): Promise<string> {
  return (await execFile("git", args, { cwd: root, maxBuffer: 100 * 1024 * 1024, encoding: "utf8" })).stdout.trim();
}
export function siteLeakCorpus(site: CompiledSite): LeakSource[] {
  // These source paths were intentionally published in the legacy reference manifest.
  // Keep all answer fingerprints and all newly introduced source filenames.
  const publicReferences = new Set(REFERENCE_DOCUMENT_MANIFEST.map((entry) => entry.sourcePath));
  return [...site.payload.cards.map((card) => ({
    ...card, source: publicReferences.has(card.source.path) ? { ...card.source, path: "ref" } : card.source,
  })), ...(site.payload.documents ?? []).map((document) => ({
    id: "document-" + document.id, question: "document-" + document.id, quickAnswerMd: document.markdown,
    followUps: [], source: { path: "ref", heading: document.id },
  }))];
}
export function contentCommitMessages(messages: string): string {
  // Git identity trailers are deliberately public attribution, like Author headers.
  return messages.replace(/^(?:Co-authored-by|Signed-off-by|Reviewed-by):[^\r\n]*(?:\r?\n|$)/gim, "");
}
export async function readHistoryEntries(root: string): Promise<Array<GitHistoryText & { objectId: string }>> {
  const records = (await git(root, ["rev-list", "--objects", "--all"])).split("\n").flatMap((line) => {
    const separator = line.indexOf(" ");
    if (separator < 0) return [];
    const objectId = line.slice(0, separator), name = line.slice(separator + 1);
    return isScannableTextPath(name) ? [{ objectId, path: name }] : [];
  });
  if (!records.length) return [];
  const output = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn("git", ["cat-file", "--batch"], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 512 * 1024 * 1024) { child.kill(); reject(new Error("历史文本超过批量扫描内存上限")); return; }
      chunks.push(chunk);
    });
    child.stderr.resume();
    child.once("error", reject);
    child.stdin.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error("Git 历史对象读取失败")));
    child.stdin.end(records.map((entry) => entry.objectId).join("\n") + "\n");
  });
  const entries: Array<GitHistoryText & { objectId: string }> = [];
  let offset = 0;
  for (const record of records) {
    const headerEnd = output.indexOf(10, offset);
    if (headerEnd < offset) throw new Error("Git 历史对象头损坏");
    const [objectId, type, sizeText] = output.subarray(offset, headerEnd).toString("ascii").split(" ");
    const size = Number(sizeText);
    if (objectId !== record.objectId || !Number.isSafeInteger(size) || size < 0 || headerEnd + 1 + size >= output.length) throw new Error("Git 历史对象边界损坏");
    offset = headerEnd + 1;
    if (type === "blob") entries.push({ ...record, text: output.subarray(offset, offset + size).toString("utf8") });
    offset += size + 1;
  }
  return entries;
}
export async function scanSiteRelease(root: string, site: CompiledSite): Promise<void> {
  const corpus = siteLeakCorpus(site);
  const entries = await readHistoryEntries(root);
  const historyFindings = entries.flatMap((entry) => scanGitHistoryLeaks("", [entry], corpus).filter((finding) =>
    finding.kind !== "absolute-path" || !site.config.approvedHistoricalPaths.some((approved) => approved.objectId === entry.objectId && approved.path === entry.path),
  ));
  const findings = [
    ...await scanForPlaintextLeaks([root], corpus),
    // Author identities are Git publication metadata; inspect commit messages for leaks.
    ...scanGitHistoryLeaks(contentCommitMessages(await git(root, ["log", "--all", "--format=%B", "--no-patch"])), [], corpus),
    ...historyFindings,
  ];
  if (findings.length) throw new Error("明文隐私检查失败：\n" + findings.map((item) => item.kind + ": " + path.relative(root, item.file)).join("\n"));
}
export async function prepareRelease(root: string, site: CompiledSite, password: string) {
  if (site.partial) throw new Error("未解锁历史题库，禁止发布不完整题库");
  const after = membership(site.payload);
  let before: MembershipEntry[] = [];
  try { before = JSON.parse(await readFile(path.join(root, "cards-membership.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const changes = membershipChanges(before, after);
  const unapproved = changes.removed.filter((id) => !site.config.approvedRemovals.includes(id));
  if (unapproved.length) throw new Error("未经批准的删除: " + unapproved.join(", "));
  const builtAt = new Date().toISOString();
  const buildId = builtAt.replace(/\D/g, "").slice(0, 14) + "-" + randomUUID().slice(0, 8);
  const envelope = await encryptEnvelope({ ...site.payload, buildId, builtAt }, password, buildId);
  return { envelope, members: after, changes };
}
export async function replaceRelease(root: string, envelope: unknown, members: MembershipEntry[]) {
  const files = [
    { path: path.join(root, "public/cards.enc.json"), value: envelope },
    { path: path.join(root, "cards-membership.json"), value: members },
  ];
  const originals = await Promise.all(files.map(async (file) => {
    try { return await readFile(file.path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }));
  const restore = async () => {
    for (let index = 0; index < files.length; index++) {
      if (originals[index]) await writeFile(files[index].path, originals[index]!);
      else await rm(files[index].path, { force: true });
    }
  };
  try {
    for (const file of files) {
      const temporary = file.path + "." + randomUUID() + ".tmp";
      try {
        await writeFile(temporary, JSON.stringify(file.value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
        await rename(temporary, file.path);
      } finally { await rm(temporary, { force: true }); }
    }
  } catch (error) { await restore(); throw error; }
  return restore;
}
