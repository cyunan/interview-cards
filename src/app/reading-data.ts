import type { ReferenceDocument } from "../content/payload";
import { readingTarget } from "../content/reading-links";
import { structuralLines } from "../content/structure";
import type { CardV2 } from "../content/types";
import type { KnowledgeRoute } from "../routes/routes";

export function plainText(markdown: string): string {
  return markdown.replace(/!?\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim();
}
export function documentTitle(note: ReferenceDocument): string {
  const filename = note.sourcePath.split("/").at(-1)?.replace(/\.md$/i, "");
  return plainText(note.title === note.id && filename ? filename : note.title);
}

export function textKey(text: string): string {
  return plainText(text).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
export function headingKey(text: string): string {
  return textKey(text.replace(/^\d+(?:\.\d+)*[.、]?\s+/, ""));
}

export interface ReadingSource {
  document: ReferenceDocument;
  relation: "问答出处" | "路线资料" | "同主题笔记";
  heading?: string;
}

export function relatedSources(card: CardV2, docs: readonly ReferenceDocument[], routes: readonly KnowledgeRoute[]): ReadingSource[] {
  const sources = new Map<string, ReadingSource>();
  const add = (document: ReferenceDocument, relation: ReadingSource["relation"], heading?: string) => {
    if (!sources.has(document.id)) sources.set(document.id, { document, relation, heading });
  };
  for (const doc of docs) if (doc.sourcePath === card.source.path) add(doc, "问答出处", card.source.heading);
  const routeIds = new Set(routes.flatMap(route => route.steps.filter(step => step.cardIds.includes(card.id))
    .flatMap(step => step.referenceDocuments?.map(ref => ref.documentId) ?? [])));
  for (const id of routeIds) {
    const doc = docs.find(item => item.id === id);
    if (doc) add(doc, "路线资料", doc.heading);
  }

  const cardText = textKey(card.question);
  const keywords = [...new Set(
    plainText(card.question).match(/[A-Za-z][A-Za-z0-9]{2,}|固有尺寸|缓存|补单|域名|掉帧|慢帧|协程|重组|死锁|线程池|分片|内存泄漏|消息队列/g) ?? []
  )].map(word => word.toLowerCase()).filter(word => !["android", "kotlin", "java"].includes(word));
  const ranked = docs.filter(doc => !sources.has(doc.id) && !doc.sourcePath.startsWith("09-")).map(doc => {
    const title = textKey(doc.title);
    const score = (title.length > 3 && cardText.includes(title) ? 12 : 0) + keywords.reduce((points, word) =>
      points + (title.includes(word) ? 3 : 0), 0);
    return { doc, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  const titles = new Set([...sources.values()].map(item => textKey(item.document.title)));
  for (const { doc } of ranked) {
    if (sources.size >= 5) break;
    const title = textKey(doc.title);
    if (titles.has(title)) continue;
    titles.add(title);
    add(doc, "同主题笔记");
  }
  return [...sources.values()];
}

export function sectionText(markdown: string, heading?: string): string {
  if (!heading) return markdown;
  const lines = markdown.split(/\r?\n/);
  const structure = structuralLines(lines);
  const key = headingKey(heading);
  const start = structure.findIndex(line => {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    return match && headingKey(match[1]) === key;
  });
  if (start < 0) return markdown;
  const level = structure[start].match(/^#+/)![0].length;
  const end = structure.findIndex((line, index) => index > start && new RegExp("^#{1," + level + "}\\s").test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

export function previewText(markdown: string, limit = 260): string {
  const visible = structuralLines(markdown.split(/\r?\n/))
    .map(line => line.replace(/^>\s*(?:\[![\w-]+\][+-]?\s*)?/, "").trim())
    .filter(line => line && !/^(#|%%|<!--|---|!\[|\|)/.test(line))
    .map(line => plainText(line.replace(/^[-+]\s+|^\d+[.)]\s+/, ""))).join(" ");
  const chars = Array.from(visible);
  return chars.length > limit ? chars.slice(0, limit).join("") + "…" : visible;
}

export function findDiagram(markdown: string): string | undefined {
  const match = markdown.match(/^(\x60{3,}|~{3,})mermaid[^\n]*\n[\s\S]*?^\1\s*$/m);
  return match?.[0];
}

export function findOrderedSteps(markdown: string): string[] {
  const lines = structuralLines(markdown.split(/\r?\n/));
  let steps: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)[.)、]\s+(.+)/);
    if (match) steps = Number(match[1]) === 1 ? [match[2]] : [...steps, match[2]];
    else if (line.trim() && steps.length < 2) steps = [];
    else if (line.trim()) break;
  }
  return steps.length >= 2 ? steps.slice(0, 7) : [];
}

interface OfficialSource { url: string; title: string }

export function officialSources(markdown: string): OfficialSource[] {
  const links = new Map<string, OfficialSource>();
  for (const match of structuralLines(markdown.split(/\r?\n/)).join("\n").matchAll(/(?<!!)\[([^\]\n]+)\]\((https:\/\/[^)\s]+)\)/g)) {
    const [, label, url] = match;
    if (readingTarget(url)) continue;
    try {
      const { hostname } = new URL(url);
      if (!/^(developer\.android\.com|source\.android\.com|kotlin(lang)?\.(org|github\.io)|docs\.oracle\.com|docs\.gradle\.org|www\.rfc-editor\.org|www\.ietf\.org|datatracker\.ietf\.org|www\.w3\.org|square\.github\.io|perfetto\.dev|github\.com|developer\.mozilla\.org|www\.kernel\.org|kotlin\.github\.io)$/.test(hostname)) continue;
      const title = /^(官方资料|参考|链接|文档|源码)$/.test(label) ? hostname : plainText(label);
      links.set(url, { url, title });
    } catch { /* Skip malformed Markdown URLs. */ }
  }
  return [...links.values()].slice(0, 4);
}
