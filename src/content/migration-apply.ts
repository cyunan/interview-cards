import { readFile, writeFile, mkdir, rm, realpath } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { compileSite, digest, readSiteConfig } from "./single-source";
import { parseCardsPayload } from "./payload";
import type { CardV2 } from "./types";

export function cardMarkdown(card: CardV2, number: string): string {
  if (/[\r\n]/.test(card.question)) throw new Error("题目含换行，需要人工核对: " + card.id);
  const callout = (kind: string, text: string) => "> [!" + kind + "]\n" + text.split("\n").map((line) => line ? "> " + line : ">").join("\n");
  const parts = ["%%card-id: " + card.id + "; priority: " + card.priority + "; decks: " + card.decks.join(",") + "%%"];
  if (card.legacyIds.length) parts.push("%%legacy-card-ids: " + card.legacyIds.join(",") + "%%");
  parts.push("### " + number + " " + card.question, "", callout("summary", card.quickAnswerMd));
  if (card.detailMd) parts.push("", "#### 深入理解", "", card.detailMd);
  if (card.projectHookMd) parts.push("", callout("tip", card.projectHookMd));
  if (card.pitfallsMd) parts.push("", callout("warning", card.pitfallsMd));
  if (card.followUps.length) {
    parts.push("", "#### 高频追问");
    for (const followUp of card.followUps) parts.push("", "##### " + followUp.question, "", ...(followUp.answerMd ? followUp.answerMd.split("\n").map((line) => line ? "> " + line : ">") : []));
  }
  parts.push("", "%%card-end%%");
  return parts.join("\n");
}
export async function applyMigration(vault: string, targets: Record<string, string>) {
  const directory = path.join(vault, "网站维护");
  const report = JSON.parse(await readFile(path.join(directory, "迁移暂存/迁移报告.json"), "utf8"));
  const raw = JSON.parse(await readFile(path.join(directory, "迁移暂存/原始题库.json"), "utf8"));
  if (digest(JSON.stringify(raw)) !== report.payloadDigest) throw new Error("暂存题库摘要不一致");
  const payload = parseCardsPayload(raw);
  const config = await readSiteConfig(vault);
  if (payload.cards.length !== config.legacyCardCount) throw new Error("迁移数量与冻结基线不符");
  const existing = await compileSite(vault);
  const existingIds = new Set(existing.inlineCards.map((card) => card.id));
  const originals = new Map<string, Buffer | undefined>();
  const writes = new Map<string, Buffer>();
  const vaultReal = await realpath(vault);
  async function safe(relative: string) {
    if (!/^0[1-9]-/.test(relative) || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..") || !relative.endsWith(".md")) throw new Error("迁移目标路径非法");
    const filename = path.join(vault, relative);
    let parent = path.dirname(filename);
    while (true) {
      try { parent = await realpath(parent); break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; parent = path.dirname(parent); }
    }
    const rel = path.relative(vaultReal, parent);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("迁移目标越过知识库");
    try {
      const resolved = await realpath(filename);
      if (resolved !== filename && resolved !== path.join(vaultReal, relative)) throw new Error("迁移不写入符号链接");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return filename;
  }
  async function source(filename: string) {
    if (!originals.has(filename)) {
      try { originals.set(filename, await readFile(filename)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; originals.set(filename, undefined); }
    }
    return (writes.get(filename) ?? originals.get(filename))?.toString("utf8") ?? "";
  }
  const used = new Set<string>();
  const locations = new Map(existing.inlineCards.map((card) => [card.id, card.source]));
  for (const group of report.groups) {
    const cards = payload.cards.filter((card) => card.source.path === group.source && !existingIds.has(card.id));
    if (!cards.length) continue;
    const target = targets[group.source];
    if (!target) throw new Error("尚未指定题组落位: " + group.source);
    if (used.has(target)) throw new Error("不同题组需要分别指定笔记，避免主题元数据混合: " + target);
    used.add(target);
    const filename = await safe(target);
    const previous = await source(filename), parsed = matter(previous);
    const reference = payload.documents?.find((document) => document.sourcePath === target);
    if (parsed.data.card_category && parsed.data.card_category !== cards[0].category || parsed.data.card_topic && parsed.data.card_topic !== cards[0].topic) throw new Error("现有笔记的卡片主题元数据不同: " + target);
    parsed.data.site_doc_id ??= reference?.id ?? "note-" + digest(target).slice(0, 16);
    parsed.data.card_category = cards[0].category; parsed.data.card_topic = cards[0].topic;
    const section = (previous.match(/^## /gm) ?? []).length + 1;
    const numerals = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];
    const initial = (!target.startsWith("09-") ? parsed.content.trim() : "") || "# " + cards[0].topic + "\n\n> [!abstract] 本文范围与关联阅读\n> 本文整理该主题的面试口述、原理与追问。\n\n---";
    const content = initial + "\n\n## " + (numerals[section] ?? section) + "、面试口述与追问\n\n" + cards.map((card, index) => cardMarkdown(card, section + "." + (index + 1))).join("\n\n") + "\n";
    writes.set(filename, Buffer.from(matter.stringify(content, parsed.data)));
    cards.forEach((card, index) => locations.set(card.id, { path: target, heading: section + "." + (index + 1) + " " + card.question }));
    config.ownedDocumentIds.push(parsed.data.site_doc_id);
  }
  // Existing technical notes remain the authoritative reference text.
  for (const document of payload.documents ?? []) {
    const filename = await safe(document.sourcePath);
    const previous = await source(filename);
    if (!previous) throw new Error("参考资料原文缺失，需要先恢复原文和图片: " + document.sourcePath);
    const parsed = matter(previous);
    if (parsed.data.site_doc_id && parsed.data.site_doc_id !== document.id) throw new Error("资料 ID 冲突: " + document.id);
    parsed.data.site_doc_id = document.id;
    writes.set(filename, Buffer.from(matter.stringify(parsed.content, parsed.data)));
    config.ownedDocumentIds.push(document.id);
  }
  config.ownedCardIds = [...new Set([...config.ownedCardIds, ...payload.cards.map((card) => card.id)])];
  config.ownedDocumentIds = [...new Set(config.ownedDocumentIds)];
  config.legacyCardIds = payload.cards.map((card) => card.id);
  config.legacyDocumentIds = payload.documents?.map((document) => document.id) ?? [];
  config.migrationComplete = true;
  for (const group of report.groups) {
    if (group.source === targets[group.source]) continue;
    const filename = await safe(group.source);
    await source(filename);
    const links = payload.cards.filter((card) => card.source.path === group.source).map((card) => {
      const location = locations.get(card.id);
      if (!location) throw new Error("卡片导航缺失: " + card.id);
      return "### " + card.question + "\n\n[[" + location.path.replace(/\.md$/, "") + "#" + location.heading + "|查看答案与技术展开]]";
    });
    writes.set(filename, Buffer.from("# " + group.topic + " · 面试导航\n\n> 正文已归并到技术笔记；本页保留旧入口，避免维护重复答案。\n\n" + links.join("\n\n") + "\n"));
  }
  const configPath = path.join(directory, "配置.yaml");
  await source(configPath);
  writes.set(configPath, Buffer.from(matter.stringify("", config).replace(/^---\n/, "").replace(/\n---\s*$/, "") + "\n"));
  const backup = path.join(directory, "迁移备份", new Date().toISOString().replace(/[:.]/g, "-"));
  for (const [filename, content] of originals) if (content) {
    const destination = path.join(backup, path.relative(vault, filename));
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 }); await writeFile(destination, content, { mode: 0o600 });
  }
  try {
    for (const [filename, content] of writes) { await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, content, { mode: 0o600 }); }
    const result = await compileSite(vault);
    const current = new Map(result.inlineCards.map((card) => [card.id, card]));
    for (const original of payload.cards) {
      if (existingIds.has(original.id)) continue;
      const migrated = current.get(original.id);
      if (!migrated) throw new Error("缺失卡片: " + original.id);
      for (const key of ["question", "quickAnswerMd", "detailMd", "projectHookMd", "pitfallsMd", "followUps", "legacyIds", "decks", "priority", "category", "topic"] as const)
        if (JSON.stringify(migrated[key], (_key, value) => typeof value === "string" ? value.replace(/\n{3,}/g, "\n\n") : value) !== JSON.stringify(original[key], (_key, value) => typeof value === "string" ? value.replace(/\n{3,}/g, "\n\n") : value)) throw new Error("迁移内容不一致，需要人工核对: " + original.id + "/" + key);
    }
    return { cards: result.inlineCards.length, documents: result.payload.documents?.length, backup };
  } catch (error) {
    for (const [filename, content] of originals) {
      if (content) await writeFile(filename, content); else await rm(filename, { force: true });
    }
    throw error;
  }
}
