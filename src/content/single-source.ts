import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { parseMarkedCard } from "./parser";
import { compileReferenceDocuments, type ReferenceDocumentManifestEntry } from "./reference-docs";
import { parseCardsPayload, validateRouteReferences, type CardsPayloadV3, type ParsedCardsPayload } from "./payload";
import type { CardV2 } from "./types";
import type { KnowledgeRoute } from "../routes/routes";
import { structuralLines } from "./structure";

export const MAINTENANCE_DIRECTORY = "网站维护";
const configSchema = z.object({
  schema: z.literal(1), legacyFile: z.literal("历史题库.enc.json"),
  legacySha256: z.string().regex(/^[a-f0-9]{64}$/),
  ownedCardIds: z.array(z.string()).refine((ids) => new Set(ids).size === ids.length),
  legacyCardCount: z.number().int().nonnegative().optional(),
  ownedDocumentIds: z.array(z.string()).default([]),
  approvedDocumentRemovals: z.array(z.string()).default([]),
  approvedHistoricalPaths: z.array(z.object({ objectId: z.string().regex(/^[a-f0-9]{40}$/), path: z.string().min(1) }).strict()).default([]),
  approvedHistoricalContent: z.array(z.object({ objectId: z.string().regex(/^[a-f0-9]{40}$/), path: z.string().min(1), kind: z.enum(["card-answer", "card-question"]), cardId: z.string().min(1) }).strict()).default([]),
  approvedRemovals: z.array(z.string()).default([]),
  migrationComplete: z.boolean().default(false),
  legacyCardIds: z.array(z.string()).default([]),
  legacyDocumentIds: z.array(z.string()).default([]),
  routes: z.array(z.unknown()),
}).strict();
export type SiteConfig = Omit<z.infer<typeof configSchema>, "routes"> & { routes: KnowledgeRoute[] };
export const digest = (source: string) => createHash("sha256").update(source).digest("hex");

export async function readSiteConfig(vault: string): Promise<SiteConfig> {
  const source = await readFile(path.join(vault, MAINTENANCE_DIRECTORY, "配置.yaml"), "utf8");
  return configSchema.parse(matter("---\n" + source + "\n---").data) as SiteConfig;
}
export async function readLegacyEnvelope(vault: string, config: SiteConfig): Promise<unknown> {
  const source = await readFile(path.join(vault, MAINTENANCE_DIRECTORY, config.legacyFile), "utf8");
  if (digest(source) !== config.legacySha256) throw new Error("历史题库快照校验失败；请恢复初始化时的只读快照。");
  return JSON.parse(source);
}
async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files.sort();
}
export function extractInlineCards(source: string, sourcePath: string, category: string, topic: string): CardV2[] {
  const lines = source.split(/\r?\n/);
  const structure = structuralLines(lines);
  const cards: CardV2[] = [];
  for (let index = 0; index < lines.length; index++) {
    const marker = structure[index].trim();
    if (!marker.startsWith("%%card-id:")) continue;
    const line = index + 1;
    const legacy = structure[index + 1]?.trim().match(/^%%legacy-card-ids:\s*(.*?)%%$/);
    if (legacy) index++;
    const heading = structure[++index]?.match(/^###\s+(.+?)\s*$/);
    if (!heading) throw new Error(sourcePath + ":" + line + " card-id 后需要三级问题标题");
    let end = index + 1;
    let explicitEnd = index + 1;
    while (explicitEnd < lines.length && structure[explicitEnd].trim() !== "%%card-end%%" && !structure[explicitEnd].trim().startsWith("%%card-id:")) explicitEnd++;
    if (structure[explicitEnd]?.trim() === "%%card-end%%") end = explicitEnd;
    else while (end < lines.length && !/^#{1,3}\s/.test(structure[end]) && !structure[end].trim().startsWith("%%card-id:")) end++;
    const parsed = parseMarkedCard({
      path: sourcePath, line, marker, question: heading[1].replace(/^\d+(?:\.\d+)*[.、]?\s+/, ""),
      category, topic, body: lines.slice(index + 1, end),
      legacyIds: legacy ? legacy[1].split(",").map((id) => id.trim()) : [],
    });
    const { line: _line, ...location } = parsed.source;
    cards.push({ ...parsed, source: { ...location, heading: heading[1] } });
    index = end - 1;
  }
  return cards;
}
export interface CompiledSite {
  payload: CardsPayloadV3; inlineCards: CardV2[]; config: SiteConfig; partial: boolean;
}
export async function compileSite(vault: string, legacy?: ParsedCardsPayload): Promise<CompiledSite> {
  const config = await readSiteConfig(vault);
  if (legacy && config.legacyCardCount !== undefined && legacy.cards.length !== config.legacyCardCount) throw new Error("历史卡片数量与冻结快照基线不符");
  const roots = (await readdir(vault, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^0[1-9]-/.test(entry.name));
  const files = (await Promise.all(roots.map((entry) => walk(path.join(vault, entry.name))))).flat();
  const notes: Array<{ path: string; source: string; data: Record<string, unknown> }> = [];
  for (const filename of files) {
    const source = await readFile(filename, "utf8");
    const parsed = matter(source);
    if (!parsed.data.site_doc_id) continue;
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(String(parsed.data.site_doc_id))) throw new Error("site_doc_id 非法: " + filename);
    notes.push({ path: path.relative(vault, filename).split(path.sep).join("/"), source, data: parsed.data });
  }
  const manifest: ReferenceDocumentManifestEntry[] = notes.map((note) => ({
    id: String(note.data.site_doc_id),
    title: String(note.data.site_title ?? note.source.match(/^#\s+(.+)$/m)?.[1] ?? note.data.site_doc_id),
    sourcePath: note.path, reason: String(note.data.site_reason ?? "对应主题的技术笔记与面试问答"),
  }));
  if (new Set(manifest.map((entry) => entry.id)).size !== manifest.length) throw new Error("site_doc_id 重复");
  const documents = await compileReferenceDocuments(vault, manifest);
  const presentDocuments = new Set(documents.map((document) => document.id));
  for (const id of config.ownedDocumentIds) if (!presentDocuments.has(id) && !config.approvedDocumentRemovals.includes(id)) throw new Error("已接管资料缺失，不能回退旧文档: " + id);
  const inlineCards = documents.flatMap((document) => {
    const note = notes.find((item) => item.path === document.sourcePath)!;
    return extractInlineCards(document.markdown, note.path,
      String(note.data.card_category ?? note.path.split("/")[0]), String(note.data.card_topic ?? document.title),
    );
  });
  for (const document of documents) document.markdown = document.markdown.replace(/^%%(?:(?:card-id|legacy-card-ids):.*|card-end)%%\s*$/gm, "").trim();
  const ids = new Set<string>();
  const oldCards = new Map(legacy?.cards.map((card) => [card.id, card]));
  const owned = new Set(config.ownedCardIds);
  for (const card of inlineCards) {
    if (ids.has(card.id)) throw new Error("卡片 ID 重复: " + card.id);
    ids.add(card.id);
    const previous = oldCards.get(card.id);
    if (previous && !owned.has(card.id)) throw new Error("尚未登记接管，禁止覆盖历史卡片: " + card.id);
    if (previous) card.legacyIds = [...new Set([...previous.legacyIds, ...card.legacyIds])];
  }
  for (const id of owned) if (!ids.has(id) && !config.approvedRemovals.includes(id)) throw new Error("已接管卡片缺失，不能回退旧答案: " + id);
  const combinedCards = [...(legacy?.cards ?? []).filter((card) => !owned.has(card.id) && !config.approvedRemovals.includes(card.id)), ...inlineCards].sort((a, b) => a.id.localeCompare(b.id));
  const documentIds = new Set(documents.map((document) => document.id));
  const combinedDocuments = [...(legacy?.documents ?? []).filter((document) => !documentIds.has(document.id) && !config.ownedDocumentIds.includes(document.id) && !config.approvedDocumentRemovals.includes(document.id)), ...documents];
  let routes = config.routes;
  if (config.migrationComplete) {
    if (config.legacyCardIds.length !== config.legacyCardCount) throw new Error("全量迁移的原始卡片 ID 基线不完整");
    for (const id of config.legacyCardIds) if (!ids.has(id) && !config.approvedRemovals.includes(id)) throw new Error("全量迁移缺失原卡片: " + id);
    for (const id of config.legacyDocumentIds) if (!presentDocuments.has(id) && !config.approvedDocumentRemovals.includes(id)) throw new Error("全量迁移缺失原资料: " + id);
  }
  if (!legacy && !config.migrationComplete) {
    const docs = new Set(combinedDocuments.map((document) => document.id));
    routes = routes.map((route) => ({ ...route, steps: route.steps.map((step) => ({
      ...step, cardIds: step.cardIds.filter((id) => ids.has(id)),
      referenceDocuments: step.referenceDocuments?.filter((reference) => docs.has(reference.documentId)),
      checkpoint: step.checkpoint && ids.has(step.checkpoint.cardId) ? step.checkpoint : undefined,
    })).filter((step) => step.cardIds.length > 0) })).filter((route) => route.steps.length > 0);
  }
  const payload: CardsPayloadV3 = {
    schema: "cards-v3", buildId: "local-" + Date.now(), builtAt: new Date().toISOString(),
    cards: combinedCards, documents: combinedDocuments, routes,
  };
  validateRouteReferences(payload);
  parseCardsPayload(payload);
  return { payload, inlineCards, config, partial: !legacy && !config.migrationComplete };
}
export interface MembershipEntry { id: string; decks: string[]; source: string; category: string; priority: string }
export function membership(payload: ParsedCardsPayload): MembershipEntry[] {
  return payload.cards.map((card) => ({ id: card.id, decks: card.decks, source: digest(card.source.path), category: card.category, priority: card.priority })).sort((a, b) => a.id.localeCompare(b.id));
}
export function membershipChanges(before: MembershipEntry[], after: MembershipEntry[]) {
  const old = new Map(before.map((entry) => [entry.id, entry]));
  const current = new Map(after.map((entry) => [entry.id, entry]));
  return {
    added: after.filter((entry) => !old.has(entry.id)).map((entry) => entry.id),
    removed: before.filter((entry) => !current.has(entry.id)).map((entry) => entry.id),
    changed: after.filter((entry) => old.has(entry.id) && JSON.stringify(old.get(entry.id)) !== JSON.stringify(entry)).map((entry) => entry.id),
  };
}
