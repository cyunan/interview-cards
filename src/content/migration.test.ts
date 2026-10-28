import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { migrationPlan } from "./migration";
import type { ParsedCardsPayload } from "./payload";
it("groups by original source and proposes existing technical notes without rewriting them", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "migration-plan-"));
  try {
    await mkdir(path.join(vault, "02-Demo"));
    await writeFile(path.join(vault, "02-Demo/Orb-原理与使用.md"), "# Orb");
    const card = { id:"orb-old-001", legacyIds:["orb-alias-001"], question:"Orb?", category:"02-Demo", topic:"Orb", decks:["full"], priority:"P1", quickAnswerMd:"Orb.", followUps:[], source:{path:"09-Demo/Orb-面试题清单.md",heading:"Orb?"} } as const;
    const payload = {schema:"cards-v2",buildId:"demo",builtAt:"2026-01-01T00:00:00Z",cards:[card]} as unknown as ParsedCardsPayload;
    const plan = await migrationPlan(vault, payload);
    expect(plan[0].ids).toEqual(["orb-old-001"]);
    expect(plan[0].candidates).toEqual(["02-Demo/Orb-原理与使用.md"]);
  } finally { await rm(vault,{recursive:true,force:true}); }
});
