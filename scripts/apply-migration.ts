import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyMigration } from "../src/content/migration-apply";
const args = process.argv.slice(2), at = args.indexOf("--vault");
if (at < 0 || !args[at + 1]) throw new Error("需要 --vault <知识库路径>");
const vault = path.resolve(args[at + 1]);
const targets = JSON.parse(await readFile(path.join(vault, "网站维护/迁移暂存/落位映射.json"), "utf8"));
console.log(await applyMigration(vault, targets));
