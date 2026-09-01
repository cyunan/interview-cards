import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanForPlaintextLeaks } from "../src/security/leak-scan";
import { validateEnvelopeFile } from "../src/security/public-envelope";

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const findings = await scanForPlaintextLeaks(
    [repositoryRoot, path.join(repositoryRoot, "dist")],
    [],
  );
  if (findings.length > 0) {
    const lines = findings.map(
      (finding) => `- ${path.relative(repositoryRoot, finding.file)}: ${finding.kind}`,
    );
    throw new Error(`发现公开仓库隐私风险：\n${lines.join("\n")}`);
  }
  await Promise.all([
    validateEnvelopeFile(path.join(repositoryRoot, "public", "cards.enc.json")),
    validateEnvelopeFile(path.join(repositoryRoot, "dist", "cards.enc.json")),
  ]);
  process.stdout.write("公开产物隐私扫描通过。\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "公开产物隐私扫描失败"}\n`);
  process.exitCode = 1;
});
