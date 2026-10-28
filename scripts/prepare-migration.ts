import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { decryptEnvelope } from "../src/crypto/envelope";
import { parseCardsPayload } from "../src/content/payload";
import { readSiteConfig, readLegacyEnvelope, digest } from "../src/content/single-source";
import { migrationPlan } from "../src/content/migration";
import { readHiddenLine } from "../src/publish/hidden-input";

async function main() {
  const args = process.argv.slice(2), at = args.indexOf("--vault");
  if (at < 0 || !args[at + 1] || process.versions.node.split(".")[0] !== "24") throw new Error("需要 Node 24 和 --vault <知识库路径>");
  const vault = path.resolve(args[at + 1]);
  const config = await readSiteConfig(vault);
  const password = await readHiddenLine("全量迁移：请输入历史题库密码（不回显、不保存密码）：");
  const payload = parseCardsPayload(await decryptEnvelope(await readLegacyEnvelope(vault, config), password));
  if (payload.cards.length !== config.legacyCardCount) throw new Error("历史题库数量与冻结基线不一致，停止迁移");
  const groups = await migrationPlan(vault, payload);
  const directory = path.join(vault, "网站维护", "迁移暂存");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  async function save(name: string, value: unknown) {
    const temp = path.join(directory, "." + randomUUID() + ".tmp");
    try {
      await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      await rename(temp, path.join(directory, name));
    } finally { await rm(temp, { force: true }); }
  }
  await save("原始题库.json", payload);
  await save("迁移报告.json", {
    schema: 1, buildId: payload.buildId, cards: payload.cards.length, groups,
    documents: payload.documents?.map(({ id, title, sourcePath }) => ({ id, title, sourcePath })),
    payloadDigest: digest(JSON.stringify(payload)),
  });
  console.log("已在本机准备 " + payload.cards.length + " 张卡片、" + groups.length + " 组来源的迁移报告。");
  console.log("尚未改写技术笔记。可以回到聊天继续核对分组和落位；密码未写入文件。");
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "准备失败"); process.exitCode = 1; });
