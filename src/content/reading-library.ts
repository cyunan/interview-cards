import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { readingHref } from "./reading-links";
import type { ReferenceDocumentManifestEntry } from "./reference-docs";

export async function walkNotes(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkNotes(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files.sort();
}

export async function extendReadingManifest(
  vault: string,
  technicalFiles: readonly string[],
  manifest: readonly ReferenceDocumentManifestEntry[],
): Promise<ReferenceDocumentManifestEntry[]> {
  // Include technical interview materials from the personal folder. Keep
  // resumes, personal information and raw source records out of this catalogue.
  const personalDirectory = path.join(vault, "00-个人资料");
  const personalFiles = await walkNotes(personalDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const personalNotes = personalFiles.filter((file) =>
    /简历技术点|面试口述|方案详解|实现详解|全流程序列图|技术深挖|简历与代码对照|技术面试复盘|面试准备|预设问题|面试自问自答|项目经历总结|真实实现与面试口述|AI辅助编程经验|部分平台相关性实现|性能优化-口述点/.test(path.relative(personalDirectory, file))
  );
  const knownPaths = new Set(manifest.map((entry) => entry.sourcePath));
  const additional = await Promise.all([...technicalFiles, ...personalNotes].flatMap((file) => {
    const sourcePath = path.relative(vault, file).split(path.sep).join("/");
    if (knownPaths.has(sourcePath)) return [];
    return [readFile(file, "utf8").then((source) => ({
      id: "library-" + createHash("sha256").update(sourcePath).digest("hex").slice(0, 20),
      sourcePath,
      title: source.match(/^#\s+(.+?)\s*$/m)?.[1] ?? path.basename(file, ".md"),
      reason: "知识库原文",
    }))];
  }));
  return [...manifest, ...additional];
}

export function documentLinkResolver(manifest: readonly ReferenceDocumentManifestEntry[]) {
  const relative = new Map(manifest.map((entry) => [entry.sourcePath.replace(/\.md$/i, ""), entry]));
  const byName = new Map<string, ReferenceDocumentManifestEntry | null>();
  for (const entry of manifest) {
    const name = path.posix.basename(entry.sourcePath, ".md");
    byName.set(name, byName.has(name) ? null : entry);
  }
  return (from: string, raw: string): string | undefined => {
    let target: string;
    try { target = decodeURIComponent(raw.trim()); } catch { return; }
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("/")) return;
    const [note, heading] = target.split("#", 2);
    const withoutExtension = note.replace(/\.md$/i, "");
    const entry = note
      ? relative.get(withoutExtension) ??
        relative.get(path.posix.normalize(path.posix.join(path.posix.dirname(from), withoutExtension))) ??
        byName.get(withoutExtension)
      : relative.get(from.replace(/\.md$/i, ""));
    if (entry) return readingHref(entry.id, heading);
  };
}
