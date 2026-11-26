import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { headingKey } from "../src/app/reading-data";
import { parseCardsPayload, type CardsPayloadV1, type CardsPayloadV2, type CardsPayloadV3, type ParsedCardsPayload, type ReferenceDocument, type ResumeEdition } from "../src/content/payload";
import { readingTarget } from "../src/content/reading-links";
import { structuralLines } from "../src/content/structure";

const run = promisify(execFile);
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => { window: { document: Document; close(): void }; serialize(): string };
};

interface PreparedResume {
  resumeEdition: ResumeEdition;
  documents: ReferenceDocument[];
  stats: { bindings: number; topics: number; followups: number; links: number; sourceDocuments: number };
}

/** Select only the edition and references reached by its visible topic labels. */
export function selectResumeDocuments(
  document: Document, documents: readonly ReferenceDocument[], edition: ReferenceDocument,
) {
  const catalogue = new Map(documents.map(note => [note.id, note]));
  const selected = new Map([[edition.id, edition]]);
  const bindings = Array.from(document.querySelectorAll<HTMLElement>("[data-interview-topic]"));
  const boundTopics = new Set(bindings.map(label => label.dataset.interviewTopic));
  const sections = document.querySelector<HTMLTemplateElement>("template#resume-interview-topics")
    ?.content.querySelectorAll<HTMLElement>("section[data-topic]");
  if (!sections?.length || !bindings.length) throw new Error("缺少可点击的题目或简历入口");

  const topics = new Set<string>();
  const headings = new Map<string, Set<string>>();
  let links = 0;
  let followups = 0;
  for (const section of sections) {
    const key = section.dataset.topic!;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(key) || topics.has(key) || !boundTopics.has(key)) {
      throw new Error("简历主题重复、非法或缺少对应入口");
    }
    topics.add(key);
    if (!section.querySelector(":scope > h2")?.textContent.trim() ||
        !section.querySelector(":scope > p")?.textContent.trim()) throw new Error("简历主题缺少问题或回答");
    for (const detail of section.querySelectorAll(":scope > details")) {
      if (!detail.querySelector("summary")?.textContent.trim() ||
          !detail.querySelector("p")?.textContent.trim()) throw new Error("简历追问缺少问题或回答");
      followups++;
    }
    const sources = section.querySelectorAll("a[href]");
    if (!sources.length) throw new Error("简历主题没有全文链接");
    for (const link of sources) {
      const target = readingTarget(link.getAttribute("href")!);
      const note = target && catalogue.get(target.id);
      if (!target || !note || !link.textContent.trim()) throw new Error("简历全文链接未收录");
      if (target.heading) {
        let available = headings.get(note.id);
        if (!available) {
          available = new Set(structuralLines(note.markdown.split(/\r?\n/)).flatMap(line => {
            const match = line.match(/^#{2,6}\s+(.+?)\s*#*\s*$/);
            return match ? [headingKey(match[1])] : [];
          }));
          headings.set(note.id, available);
        }
        if (!available.has(headingKey(target.heading))) throw new Error("简历全文链接的小节不存在：" + note.id);
      }
      selected.set(note.id, note);
      links++;
    }
  }
  if (boundTopics.size !== topics.size) throw new Error("简历入口引用了缺失的主题");
  return {
    documents: [...selected.values()],
    stats: { bindings: bindings.length, topics: topics.size, followups, links, sourceDocuments: selected.size - 1 },
  };
}

async function vaultFile(root: string, filename: string) {
  const file = await realpath(filename);
  if (!file.startsWith(root + path.sep)) throw new Error("简历资源超出知识库目录");
  return file;
}

async function inlinePrintImages(document: Document, htmlFile: string, vault: string) {
  const images = Array.from(document.querySelectorAll("img"));
  if (!images.length) return;
  const temp = await mkdtemp(path.join(tmpdir(), "resume-images-"));
  try {
    for (const image of images) {
      const src = image.getAttribute("src") ?? "";
      if (!src || /^[a-z]+:|^[\\/]/i.test(src)) throw new Error("简历照片必须为知识库相对路径");
      const input = await vaultFile(vault, path.resolve(path.dirname(htmlFile), decodeURIComponent(src)));
      const resized = path.join(temp, "resized.jpg");
      await run("sips", ["-Z", "480", "-s", "format", "jpeg", "-s", "formatOptions", "80", input, "--out", resized]);
      // Strip EXIF, location metadata and embedded thumbnails from the resized JPEG.
      const { stdout } = await run("jpegtran", ["-copy", "none", resized], { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 });
      image.setAttribute("src", "data:image/jpeg;base64," + stdout.toString("base64"));
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function prepareResumeEdition(
  vault: string, previewPayload: Pick<ParsedCardsPayload, "documents">, resumeSourcePath: string,
): Promise<PreparedResume> {
  const documents = previewPayload.documents ?? [];
  const edition = documents.find(note => note.sourcePath === resumeSourcePath);
  if (!edition || !resumeSourcePath.endsWith(".md")) throw new Error("未找到完整版简历文字稿");
  const root = await realpath(vault);
  const htmlFile = await vaultFile(root, path.resolve(root, resumeSourcePath.slice(0, -3) + ".html"));
  const dom = new JSDOM(await readFile(htmlFile, "utf8"));
  try {
    const doc = dom.window.document;
    const selected = selectResumeDocuments(doc, documents, edition);
    await inlinePrintImages(doc, htmlFile, root);
    for (const element of doc.querySelectorAll("*")) {
      for (const name of element.getAttributeNames()) if (name.startsWith("on")) element.removeAttribute(name);
    }
    return { ...selected, resumeEdition: { documentId: edition.id, html: dom.serialize() } };
  } finally {
    dom.window.close();
  }
}

/** Explicit edition update. The existing publication supplies its cards, routes and other documents. */
export function mergeResumeEdition<T extends ParsedCardsPayload | CardsPayloadV1 | CardsPayloadV2>(
  current: T, prepared: PreparedResume, buildId: string, builtAt: string,
) {
  const documents = new Map((current.documents ?? []).map(document => [document.id, document]));
  for (const note of prepared.documents) {
    const previous = documents.get(note.id);
    if (previous && previous.sourcePath !== note.sourcePath) throw new Error("简历资料 ID 已被不同的文章占用");
    documents.set(note.id, note);
  }
  const next = {
    ...current, buildId, builtAt, documents: [...documents.values()], resumeEdition: prepared.resumeEdition,
  };
  // Validate on the wire representation. A validator's reconstructed copy can reorder
  // keys or add legacy defaults to unrelated, already-published card and route objects.
  parseCardsPayload(next);
  return next;
}

/** A routine bank refresh retains the last published edition and its linked articles. */
export function retainPublishedResume(current: ParsedCardsPayload, refreshed: CardsPayloadV3): CardsPayloadV3 {
  const edition = current.resumeEdition;
  if (!edition) return refreshed;
  const original = current.documents?.find(note => note.id === edition.documentId);
  if (!original) throw new Error("已发布的简历缺少文字稿");
  const documents = new Map(refreshed.documents?.map(note => [note.id, note]));
  const available = new Map(current.documents?.map(note => [note.id, note]));
  for (const note of documents.values()) available.set(note.id, note);
  const dom = new JSDOM(edition.html);
  try {
    const retained = selectResumeDocuments(dom.window.document, [...available.values()], available.get(original.id)!);
    for (const note of retained.documents) documents.set(note.id, note);
    return { ...refreshed, documents: [...documents.values()], resumeEdition: edition };
  } finally {
    dom.window.close();
  }
}
