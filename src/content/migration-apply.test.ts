import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { applyMigration, cardMarkdown } from "./migration-apply";
import { digest, compileSite, extractInlineCards } from "./single-source";
import type { CardV2 } from "./types";
const card: CardV2 = {id:"orb-demo-001",legacyIds:["orb-old-001"],question:"Orb?",category:"02-Demo",topic:"Orb",decks:["full"],priority:"P1",quickAnswerMd:"An imaginary orb.",detailMd:"### Nested detail\n\nThe detail stays intact.",followUps:[{question:"Why?",answerMd:"Because."}],source:{path:"09-Demo/Orb.md",heading:"Orb?"}};
it("round trips nested headings and aliases through explicit card boundaries", () => {
  const next = extractInlineCards(cardMarkdown(card,"1.1"),"02-Demo/Orb.md","02-Demo","Orb")[0];
  expect(next.detailMd).toBe(card.detailMd);
  expect(next.legacyIds).toEqual(card.legacyIds);
  expect(next.followUps).toEqual(card.followUps);
});
it("migrates the full bank, replaces old answers with links, and no longer requires legacy for preview", async () => {
  const vault=await mkdtemp(path.join(os.tmpdir(),"full-migrate-"));
  try {
    for(const name of ["02-Demo","09-Demo","网站维护/迁移暂存"]) await mkdir(path.join(vault,name),{recursive:true});
    const payload={schema:"cards-v2",buildId:"demo",builtAt:"2026-01-01T00:00:00Z",cards:[card],documents:[]};
    await writeFile(path.join(vault,"09-Demo/Orb.md"),"# Old list\nOld answer.");
    await writeFile(path.join(vault,"网站维护/配置.yaml"),JSON.stringify({schema:1,legacyFile:"历史题库.enc.json",legacySha256:"a".repeat(64),legacyCardCount:1,ownedCardIds:[],routes:[]}));
    await writeFile(path.join(vault,"网站维护/迁移暂存/原始题库.json"),JSON.stringify(payload));
    await writeFile(path.join(vault,"网站维护/迁移暂存/迁移报告.json"),JSON.stringify({payloadDigest:digest(JSON.stringify(payload)),groups:[{source:card.source.path}]}));
    const result=await applyMigration(vault,{[card.source.path]:"02-Demo/Orb.md"});
    expect(result.cards).toBe(1);
    expect((await compileSite(vault)).partial).toBe(false);
    expect(await readFile(path.join(vault,"09-Demo/Orb.md"),"utf8")).not.toContain("Old answer");
    expect(await readFile(path.join(vault,"09-Demo/Orb.md"),"utf8")).toContain("查看答案");
  } finally {await rm(vault,{recursive:true,force:true});}
});
