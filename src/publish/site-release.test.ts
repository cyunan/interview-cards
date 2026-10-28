import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { git, readHistoryEntries, scanSiteRelease } from "./site-release";
import type { CompiledSite } from "../content/single-source";

it("reads full Git history in a batch and restricts approved historical paths to the exact object", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "site-history-"));
  try {
    await git(root, ["init", "-q"]);
    const author = ["-c", "user.name=Fixture", "-c", "user.email=fixture@users.noreply.github.com"];
    const oldPath = "/" + "Users" + "/fixture/.nvm/versions/node/v24.0.0/bin";
    await writeFile(path.join(root, "known.md"), oldPath + "\n");
    await git(root, ["add", "known.md"]);
    await git(root, [...author, "commit", "-qm", "Historical fixture"]);
    const objectId = await git(root, ["rev-parse", "HEAD:known.md"]);
    await writeFile(path.join(root, "known.md"), "Clean present content.\n");
    await git(root, ["add", "known.md"]);
    await git(root, [...author, "commit", "-qm", "Remove historical path"]);
    const entries = await readHistoryEntries(root);
    expect(entries.some((entry) => entry.objectId === objectId && entry.text.includes(oldPath))).toBe(true);
    const site: CompiledSite = {
      partial: false, inlineCards: [],
      payload: { schema: "cards-v3", buildId: "fictional", builtAt: "2026-01-01T00:00:00Z", cards: [], documents: [], routes: [] },
      config: { schema: 1, legacyFile: "历史题库.enc.json", legacySha256: "a".repeat(64), ownedCardIds: [], ownedDocumentIds: [], approvedRemovals: [], approvedDocumentRemovals: [], approvedHistoricalPaths: [], routes: [] },
    };
    await expect(scanSiteRelease(root, site)).rejects.toThrow("absolute-path");
    site.config.approvedHistoricalPaths = [{ objectId, path: "known.md" }];
    await expect(scanSiteRelease(root, site)).resolves.toBeUndefined();
    await writeFile(path.join(root, "new.md"), oldPath + "\n");
    await expect(scanSiteRelease(root, site)).rejects.toThrow("absolute-path");
  } finally { await rm(root, { recursive: true, force: true }); }
});
