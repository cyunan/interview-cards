import path from "node:path";
import { readdir } from "node:fs/promises";
import type { ParsedCardsPayload } from "./payload";

export interface MigrationGroup {
  source: string; category: string; topic: string; ids: string[];
  candidates: string[];
}
export async function migrationPlan(vault: string, payload: ParsedCardsPayload): Promise<MigrationGroup[]> {
  const files: string[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.relative(vault, filename).split(path.sep).join("/"));
    }
  }
  for (const entry of await readdir(vault, { withFileTypes: true })) {
    if (entry.isDirectory() && /^0[1-9]-/.test(entry.name)) await walk(path.join(vault, entry.name));
  }
  const normalize = (name: string) => name.replace(/\.md$/, "").replace(/面试题清单|面试题|清单|原理与使用|全面技术文档/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const groups = new Map<string, MigrationGroup>();
  for (const card of payload.cards) {
    const group = groups.get(card.source.path) ?? { source: card.source.path, category: card.category, topic: card.topic, ids: [], candidates: [] };
    group.ids.push(card.id); groups.set(card.source.path, group);
  }
  for (const group of groups.values()) {
    const stem = normalize(path.posix.basename(group.source));
    group.candidates = files.filter((file) => /^0[1-8]-/.test(file))
      .map((file) => {
        const name = normalize(path.posix.basename(file));
        const score = name === stem ? 100 : name.length > 2 && stem.length > 2 && (name.includes(stem) || stem.includes(name)) ? 50 : 0;
        return { file, score };
      }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
      .slice(0, 6).map((entry) => entry.file);
  }
  return [...groups.values()].sort((a, b) => a.source.localeCompare(b.source));
}
