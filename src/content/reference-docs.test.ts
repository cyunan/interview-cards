import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compileReferenceDocuments } from "./reference-docs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("compileReferenceDocuments", () => {
  it("packages local images into the encrypted document payload", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "reference-docs-"));
    roots.push(root);
    const relativePath = "02-Android/Framework/应用启动-冷启动&热启动.md";
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(path.join(root, "image.png"), Buffer.from([0, 1, 2, 3]));
    await writeFile(absolutePath, `---\nprivate: true\n---\n# 启动\n\n[[Handler机制-Android 消息驱动机制]]\n\n![[image.png]]\n`, "utf8");

    const documents = await compileReferenceDocuments(root);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      id: "android-startup",
      sourcePath: relativePath,
    });
    expect(documents[0].markdown).toContain("Handler机制-Android 消息驱动机制");
    expect(documents[0].markdown).toMatch(/!\[image\.png\]\(https:\/\/interview-cards\.invalid\/reference-image\/[a-f0-9]+\)/);
    expect(documents[0].markdown).not.toContain(root);
    expect(documents[0].images).toHaveLength(1);
    expect(documents[0].images?.[0]).toMatchObject({
      alt: "image.png",
      mimeType: "image/png",
      data: Buffer.from([0, 1, 2, 3]).toString("base64"),
    });
    await expect(readFile(absolutePath, "utf8")).resolves.toContain("private: true");
  });

  it("keeps an allowlisted remote image address for the unlocked reader", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "reference-docs-"));
    roots.push(root);
    const relativePath = "02-Android/Framework/应用启动-冷启动&热启动.md";
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "# 启动\n\n![启动流程](https://cdn.nlark.com/startup.svg)\n", "utf8");
    const documents = await compileReferenceDocuments(root);

    expect(documents[0].markdown).toContain("![启动流程](https://cdn.nlark.com/startup.svg)");
    expect(documents[0].images ?? []).toHaveLength(0);
  });
});
