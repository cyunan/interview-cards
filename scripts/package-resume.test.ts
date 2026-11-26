import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { parseCardsPayload, type CardsPayloadV3, type ParsedCardsPayload, type ReferenceDocument } from "../src/content/payload";
import { mergeResumeEdition, prepareResumeEdition, retainPublishedResume } from "./package-resume";
import { E2E_PAYLOAD } from "../tests/fixture-payload";

const root = await mkdtemp(path.join(tmpdir(), "edition-fixture-"));
const editionPath = "profile/reader.md";
const date = "2025-01-02T03:04:05Z";
const note = (id: string, sourcePath: string, markdown = "## Appendix\nA sample."): ReferenceDocument =>
  ({ id, sourcePath, title: id, markdown, reason: "Fixture" });
const edition = note("candidate", editionPath);
const source = note("chapter", "reading/a.md");
const other = note("other", "reading/b.md");
const privateNote = note("private", "draft/c.md");
const html = `<h1 data-interview-topic="example">Example</h1>
  <template id="resume-interview-topics"><section data-topic="example">
  <h2>Sample?</h2><p>A response.</p><details><summary>More?</summary><p>Yes.</p></details>
  <a href="https://interview-cards.invalid/document/chapter#Appendix">Section</a></section></template>`;
const catalogue = { documents: [edition, source, privateNote] };
const current: CardsPayloadV3 = { schema: "cards-v3", buildId: "bank", builtAt: date, cards: [], routes: [], documents: [other] };

async function prepared(markup = html) {
  const vault = await mkdtemp(path.join(root, "vault-"));
  await mkdir(path.join(vault, "profile"));
  await writeFile(path.join(vault, "profile/reader.html"), markup);
  return prepareResumeEdition(vault, catalogue, editionPath);
}
afterAll(() => rm(root, { recursive: true, force: true }));

it("updates only the selected sources and preserves the existing bank", async () => {
  const result = await prepared();
  expect(result.stats).toEqual({ bindings: 1, topics: 1, followups: 1, links: 1, sourceDocuments: 1 });
  const bank = { ...current, documents: [other, { ...source, markdown: "Previous text" }] };
  const merged = mergeResumeEdition(bank, result, "release", date);
  expect(merged.documents).toEqual([other, source, edition]);
  expect(merged.resumeEdition?.documentId).toBe(edition.id);
  expect(merged.resumeEdition?.html).toContain("data-interview-topic");
  expect(merged.routes).toEqual(bank.routes);
  expect(bank.documents[1].markdown).toBe("Previous text");
});

it("rejects missing topic bindings, targets and heading anchors", async () => {
  await expect(prepared(html.replace('topic="example">Example', 'topic="other">Example'))).rejects.toThrow();
  await expect(prepared(html.replace("/chapter#", "/absent#"))).rejects.toThrow();
  await expect(prepared(html.replace("#Appendix", "#Removed"))).rejects.toThrow();
  expect(() => parseCardsPayload({ ...current, resumeEdition: { documentId: "missing", html } })).toThrow();
});

it("retains the published article set on ordinary bank refresh and checks refreshed sections", async () => {
  const live = mergeResumeEdition(current, await prepared(), "published", date);
  const updated = { ...source, markdown: source.markdown + "\nRevised." };
  const fresh = { ...current, documents: [updated] };
  const preserved = retainPublishedResume(live, fresh);
  expect(preserved.documents).toEqual([updated, edition]);
  expect(preserved.resumeEdition).toEqual(live.resumeEdition);
  expect(preserved.buildId).toBe(fresh.buildId);
  expect(() => retainPublishedResume(live, { ...fresh, documents: [{ ...source, markdown: "## Changed" }] })).toThrow();
});

it.each(["cards-v1", "cards-v2"] as const)("preserves %s schema and default routing on update", async schema => {
  const old: ParsedCardsPayload = parseCardsPayload({ schema, buildId: "old", builtAt: date, cards: [] });
  const merged = mergeResumeEdition(old, await prepared(), "new", date);
  expect(merged.schema).toBe(schema);
  expect(merged.routes).toBeUndefined();
  expect(parseCardsPayload(merged)).toEqual(merged);
});

it("preserves the original wire cards byte for byte, including a legacy card without aliases", async () => {
  const merged = mergeResumeEdition(E2E_PAYLOAD, await prepared(), "new", date);
  expect(JSON.stringify(merged.cards)).toBe(JSON.stringify(E2E_PAYLOAD.cards));
  expect(parseCardsPayload(merged).cards[0].legacyIds).toEqual([]);
});
