import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertReportMatchesBaseline } from "../src/content/baseline";
import { compileVault, type CompileReport } from "../src/content/vault";
import { parseVaultArgument } from "../src/publish/args";
import { buildEncryptedCards } from "../src/publish/build";
import { readHiddenLine } from "../src/publish/hidden-input";
import {
  formatWeakPublicationPasswordWarning,
  validatePublicationPasswords,
} from "../src/publish/password";

async function main(): Promise<void> {
  const vaultRoot = path.resolve(parseVaultArgument(process.argv.slice(2)));
  const baseline = JSON.parse(
    await readFile(new URL("../cards-baseline.json", import.meta.url), "utf8"),
  ) as CompileReport;

  const checked = await compileVault(vaultRoot);
  assertReportMatchesBaseline(checked.report, baseline);
  process.stdout.write(
    `准备加密 ${checked.report.cards} 张卡片。密码不会显示、记录或写入仓库。\n`,
  );
  const first = await readHiddenLine("发布密码：");
  const second = await readHiddenLine("再次输入：");
  const password = validatePublicationPasswords(first, second, (length) => {
    process.stdout.write(`${formatWeakPublicationPasswordWarning(length)}\n`);
  });
  const builtAt = new Date().toISOString();
  const buildId = `${builtAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const outputPath = fileURLToPath(
    new URL("../public/cards.enc.json", import.meta.url),
  );
  const result = await buildEncryptedCards({
    vaultRoot,
    outputPath,
    baseline,
    password,
    buildId,
    builtAt,
  });
  process.stdout.write(
    `密文已生成：public/cards.enc.json（build ${result.envelope.buildId}）。未提交、未推送。\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "题库发布失败"}\n`);
  process.exitCode = 1;
});
