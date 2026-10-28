import { mkdir, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { PREVIEW_NOTE, PREVIEW_VAULT } from "./preview-fixture";
await mkdir(path.join(PREVIEW_VAULT, "02-Imaginary"), { recursive: true });
await mkdir(path.join(PREVIEW_VAULT, "网站维护"), { recursive: true });
await writeFile(path.join(PREVIEW_VAULT, "02-Imaginary/note.md"), PREVIEW_NOTE);
await writeFile(path.join(PREVIEW_VAULT, "02-Imaginary/orb.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO2kAAAAASUVORK5CYII=", "base64"));
await writeFile(path.join(PREVIEW_VAULT, "网站维护/配置.yaml"), JSON.stringify({
  schema: 1, legacyFile: "历史题库.enc.json", legacySha256: "a".repeat(64), ownedCardIds: ["imaginary-live-001"], approvedRemovals: [],
  routes: [{ id: "imaginary-route", title: "Imaginary route", summary: "Imaginary route summary", level: "Demo", estimatedMinutes: 1,
    steps: [{ id: "imaginary-step", title: "Imaginary step", purpose: "Try preview", transition: "Done", cardIds: ["imaginary-live-001"], referenceDocuments: [{ documentId: "imaginary-reference" }] }] }],
}));
const child = spawn(process.execPath, ["--import", "tsx", "scripts/maintain.ts", "preview", "--vault", PREVIEW_VAULT, "--port", "5186"], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => { await rm(PREVIEW_VAULT, { recursive: true, force: true }); process.exit(code ?? 0); });
