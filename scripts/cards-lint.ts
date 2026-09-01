import { readFile } from "node:fs/promises";
import path from "node:path";

import { assertReportMatchesBaseline } from "../src/content/baseline";
import { compileVault, type CompileReport } from "../src/content/vault";
import { parseVaultArgument } from "../src/publish/args";

async function main(): Promise<void> {
  const vaultRoot = path.resolve(parseVaultArgument(process.argv.slice(2)));
  const baseline = JSON.parse(
    await readFile(new URL("../cards-baseline.json", import.meta.url), "utf8"),
  ) as CompileReport;
  const compiled = await compileVault(vaultRoot);
  assertReportMatchesBaseline(compiled.report, baseline);
  process.stdout.write(`${JSON.stringify(compiled.report, null, 2)}\n题库检查通过。\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "题库检查失败"}\n`);
  process.exitCode = 1;
});
