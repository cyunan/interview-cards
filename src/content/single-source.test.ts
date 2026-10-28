import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { compileSite, extractInlineCards, membership, membershipChanges } from "./single-source";
import { parseCardsPayload, type ParsedCardsPayload } from "./payload";
import { prepareRelease, replaceRelease } from "../publish/site-release";
import { siteLeakCorpus } from "../publish/site-release";
import { scanTextForPlaintextLeaks } from "../security/leak-scan";
import { REFERENCE_DOCUMENT_MANIFEST } from "./reference-docs";
import { decryptEnvelope } from "../crypto/envelope";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const marker = "%%card-id: orbit-demo-001; priority: P1; decks: full%%";
const body = marker + "\n### 2.1 What powers the imaginary orbit?\n\n> [!summary] Brief\n> An imaginary wheel powers the orbit.\n\n#### 深入理解\n\n| Part | Role |\n| --- | --- |\n| Wheel | Orbit |\n";
const note = "---\nsite_doc_id: orbit-note\n---\n# Orbit tutorial\n\n### Unmarked heading\nNo card.\n\n" + body;
async function fixture(owned = ["orbit-demo-001"]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "single-source-")); roots.push(root);
  await mkdir(path.join(root, "02-Tech")); await mkdir(path.join(root, "网站维护")); await mkdir(path.join(root, "public"));
  await writeFile(path.join(root, "02-Tech/note.md"), note);
  await writeFile(path.join(root, "网站维护/配置.yaml"), JSON.stringify({ schema: 1, legacyFile: "历史题库.enc.json", legacySha256: "a".repeat(64), ownedCardIds: owned, approvedRemovals: [], routes: [] }));
  return root;
}
function legacy(cards: ParsedCardsPayload["cards"]): ParsedCardsPayload {
  return { schema: "cards-v2", buildId: "old-version", builtAt: "2026-01-01T00:00:00Z", cards, documents: [] };
}
it("only reads explicitly marked sections, not normal headings or fenced templates", () => {
  const source = "~~~markdown\n" + body + "\n~~~\n" + body;
  const cards = extractInlineCards(source, "02-Tech/note.md", "02-Tech", "Orbit");
  expect(cards).toHaveLength(1);
  expect(cards[0].question).toBe("What powers the imaginary orbit?");
  expect(cards[0].detailMd).toContain("| Wheel | Orbit |");
});
it("does not mistake a callout shown in a code example for the actual quick answer", () => {
  expect(() => extractInlineCards(marker + "\n### Example\n~~~markdown\n> [!summary] Example only\n> This is not the answer.\n~~~", "02-Tech/example.md", "02-Tech", "Orbit")).toThrow("缺少");
});
it("keeps stable identity when a marked note is renamed and ignores unmarked personal notes", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "02-Tech/personal.md"), "# Personal\nNever export this private sentence.");
  const first = await compileSite(root);
  await rename(path.join(root, "02-Tech/note.md"), path.join(root, "02-Tech/moved.md"));
  const moved = await compileSite(root);
  expect(moved.payload.cards[0].id).toBe(first.payload.cards[0].id);
  expect(moved.payload.documents?.[0].id).toBe("orbit-note");
  expect(JSON.stringify(moved.payload)).not.toContain("private sentence");
  expect(moved.payload.documents?.[0].markdown).not.toContain("%%card-id:");
});
it("packages each note image once rather than repeating its bytes on every card", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "02-Tech/picture.png"), Buffer.from([0,1,2,3]));
  await writeFile(path.join(root, "02-Tech/note.md"), note + "\n![[picture.png]]\n");
  const result = await compileSite(root);
  expect(result.payload.documents?.[0].images).toHaveLength(1);
  expect(result.payload.cards[0].images).toBeUndefined();
  expect(result.payload.cards[0].detailMd).toContain("reference-image");
});
it("merges legacy cards once and preserves aliases without silently taking ownership", async () => {
  const root = await fixture();
  const inline = (await compileSite(root)).payload.cards[0];
  const old = { ...inline, quickAnswerMd: "Original answer.", legacyIds: ["orbit-alias-001"] };
  const untouched = { ...inline, id: "orbit-other-001", quickAnswerMd: "Keep this fictional answer." };
  const full = await compileSite(root, legacy([old, untouched]));
  expect(full.partial).toBe(false);
  expect(full.payload.cards).toHaveLength(2);
  expect(full.payload.cards[0].legacyIds).toContain("orbit-alias-001");
  expect(full.payload.cards.find((card) => card.id === untouched.id)).toEqual(untouched);
  const configPath = path.join(root, "网站维护/配置.yaml");
  const config = JSON.parse(await readFile(configPath, "utf8")); config.ownedCardIds = [];
  await writeFile(configPath, JSON.stringify(config));
  await expect(compileSite(root, legacy([old]))).rejects.toThrow("禁止覆盖");
});
it("blocks disappearance of an adopted card, instead of resurrecting its old answer", async () => {
  const root = await fixture();
  const old = (await compileSite(root)).payload.cards[0];
  await writeFile(path.join(root, "02-Tech/note.md"), "# No opted-in content");
  await expect(compileSite(root, legacy([old]))).rejects.toThrow("不能回退旧答案");
});
it("rejects duplicate IDs and unresolved full-bank routes", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "02-Tech/other.md"), note.replace("orbit-note", "orbit-note-two"));
  await expect(compileSite(root)).rejects.toThrow("ID 重复");
  await rm(path.join(root, "02-Tech/other.md"));
  const configPath = path.join(root, "网站维护/配置.yaml");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.routes = [{ id: "orbit-route", title: "Orbit", summary: "", level: "", estimatedMinutes: 1, steps: [{ id: "orbit-step", title: "Step", purpose: "", transition: "", cardIds: ["not-present"], referenceDocuments: [] }] }];
  await writeFile(configPath, JSON.stringify(config));
  await expect(compileSite(root, legacy([]))).rejects.toThrow("不存在的卡片");
});
it("publishes v3 only with a complete legacy bank and can restore both release files", async () => {
  const root = await fixture();
  const partial = await compileSite(root);
  await expect(prepareRelease(root, partial, "fictional-test-password")).rejects.toThrow("禁止发布");
  const full = await compileSite(root, legacy([]));
  const prepared = await prepareRelease(root, full, "fictional-test-password");
  const decoded = parseCardsPayload(await decryptEnvelope(prepared.envelope, "fictional-test-password"));
  expect(decoded.schema).toBe("cards-v3");
  expect(decoded.cards[0].id).toBe("orbit-demo-001");
  await writeFile(path.join(root, "public/cards.enc.json"), "previous-envelope");
  const restore = await replaceRelease(root, prepared.envelope, prepared.members);
  expect(JSON.parse(await readFile(path.join(root, "cards-membership.json"), "utf8"))).toHaveLength(1);
  await restore();
  expect(await readFile(path.join(root, "public/cards.enc.json"), "utf8")).toBe("previous-envelope");
  await expect(readFile(path.join(root, "cards-membership.json"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(membershipChanges(membership(full.payload), [])).toMatchObject({ removed: ["orbit-demo-001"] });
});
it("fingerprints new source names and all answer text, while recognizing existing public reference metadata", async () => {
  const root = await fixture();
  const site = await compileSite(root);
  const original = site.payload.cards[0];
  site.payload.cards[0] = { ...original, source: { ...original.source, path: REFERENCE_DOCUMENT_MANIFEST[0].sourcePath } };
  let corpus = siteLeakCorpus(site);
  expect(scanTextForPlaintextLeaks("public.ts", REFERENCE_DOCUMENT_MANIFEST[0].sourcePath, corpus)).toHaveLength(0);
  expect(scanTextForPlaintextLeaks("public.ts", original.quickAnswerMd, corpus).some((finding) => finding.kind === "card-answer")).toBe(true);
  site.payload.cards[0] = { ...original, source: { ...original.source, path: "02-Tech/new-secret-source.md" } };
  corpus = siteLeakCorpus(site);
  expect(scanTextForPlaintextLeaks("public.ts", "new-secret-source.md", corpus).some((finding) => finding.kind === "source-filename")).toBe(true);
});
