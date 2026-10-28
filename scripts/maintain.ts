import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { createInterface } from "node:readline/promises";
import { createServer } from "vite";
import { compileSite, digest, MAINTENANCE_DIRECTORY, readSiteConfig, readLegacyEnvelope, membership, membershipChanges } from "../src/content/single-source";
import { parseCardsPayload, type ParsedCardsPayload } from "../src/content/payload";
import { decryptEnvelope } from "../src/crypto/envelope";
import { readHiddenLine } from "../src/publish/hidden-input";
import { validatePublicationPasswords } from "../src/publish/password";
import { git, prepareRelease, replaceRelease, scanSiteRelease } from "../src/publish/site-release";
import { KNOWLEDGE_ROUTES } from "../src/routes/routes";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const command = args[0];
const vaultIndex = args.indexOf("--vault");
const vault = vaultIndex < 0 ? "" : path.resolve(args[vaultIndex + 1] ?? "");
const yaml = (value: object) => matter.stringify("", value).replace(/^---\n/, "").replace(/\n---\s*$/, "") + "\n";
const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
const exists = async (file: string) => access(file).then(() => true, () => false);
async function run(binary: string, arguments_: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, arguments_, { cwd: root, stdio: "inherit", env: { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH } });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(binary + " 执行失败（" + code + "）")));
  });
}
async function unlockLegacy(password: string) {
  const config = await readSiteConfig(vault);
  return parseCardsPayload(await decryptEnvelope(await readLegacyEnvelope(vault, config), password));
}
async function writeIndex(site: Awaited<ReturnType<typeof compileSite>>) {
  const groups = new Map<string, string[]>();
  for (const card of site.inlineCards) {
    const items = groups.get(card.category) ?? [];
    items.push("- [[" + card.source.path.replace(/\.md$/, "") + "#" + card.source.heading + "|" + card.question + "]]");
    groups.set(card.category, items);
  }
  const output = "# 网站题库索引\n\n> 自动生成；请修改链接指向的技术笔记。" + (site.partial ? "未迁移题目继续由只读历史题库提供。" : "全部卡片已由笔记直接生成。") + "\n\n" +
    [...groups].map(([category, lines]) => "## " + category + "\n\n" + lines.join("\n")).join("\n\n") + "\n";
  const target = path.join(vault, "09-面试题整理", "网站题库索引.md");
  if (await exists(target) && !(await readFile(target, "utf8")).includes("> 自动生成；")) throw new Error("索引文件已存在且不是生成文件，拒绝覆盖");
  await writeFile(target, output);
}
async function init() {
  const directory = path.join(vault, MAINTENANCE_DIRECTORY);
  await mkdir(directory, { recursive: true });
  const snapshot = path.join(directory, "历史题库.enc.json");
  if (!await exists(snapshot)) await copyFile(path.join(root, "public/cards.enc.json"), snapshot);
  const configFile = path.join(directory, "配置.yaml");
  if (!await exists(configFile)) await writeFile(configFile, yaml({
    schema: 1, legacyFile: "历史题库.enc.json",
    legacySha256: digest(await readFile(snapshot, "utf8")),
    legacyCardCount: JSON.parse(await readFile(path.join(root, "cards-baseline.json"), "utf8")).cards,
    ownedCardIds: [], ownedDocumentIds: [], approvedRemovals: [], approvedDocumentRemovals: [], routes: KNOWLEDGE_ROUTES,
  }));
  await writeFile(path.join(directory, "本机配置.json"), JSON.stringify({ repository: root, vault, node: process.execPath }, null, 2) + "\n", { mode: 0o600 });
  for (const [name, action] of [["预览网站.command", "preview --open"], ["发布网站.command", "publish"], ["新增问答.command", "add-card"], ["完整预览.command", "preview --with-legacy --open"]]) {
    await writeFile(path.join(directory, name), "#!/bin/zsh\ncd -- " + shellQuote(root) + " || exit 1" +
      "\n" + shellQuote(process.execPath) + " --import tsx scripts/maintain.ts " + action + " --vault " + shellQuote(vault) +
      "\nresult=$?\nprintf '\\n按回车关闭窗口…'\nread -r\nexit $result\n", { mode: 0o700 });
  }
  await writeFile(path.join(directory, ".gitignore"), "本机配置.json\n*.command\n迁移暂存/\n迁移备份/\n");
  console.log("本机入口已配置。双击知识库中的预览网站.command 或发布网站.command。");
}
async function preview() {
  const portAt = args.indexOf("--port");
  const port = portAt < 0 ? 5173 : Number(args[portAt + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("预览端口无效");
  const url = "http://127.0.0.1:" + port + "/interview-cards/";
  const openBrowser = () => {
    if (args.includes("--open") && process.platform === "darwin") spawn("open", [url], { stdio: "ignore" }).on("error", () => undefined);
  };
  const running = await fetch(url + "__site/preview", { method: "POST", headers: { Origin: new URL(url).origin }, signal: AbortSignal.timeout(500) })
    .then((response) => response.json()).catch(() => undefined);
  if (running?.workspaceId === digest(vault)) {
    if (args.includes("--with-legacy") && running.partial) throw new Error("试点预览正在运行；先在原终端按 Ctrl+C，再打开完整预览入口。");
    openBrowser(); console.log("同一知识库的预览已在运行：" + url); return;
  }
  let legacy: ParsedCardsPayload | undefined;
  if (args.includes("--with-legacy")) legacy = await unlockLegacy(await readHiddenLine("历史题库密码（仅当前进程使用）："));
  let state: { payload?: ParsedCardsPayload; partial?: boolean; error?: string } = {};
  let generation = 0;
  async function refresh() {
    const current = ++generation;
    try {
      const compiled = await compileSite(vault, legacy);
      if (generation === current) state = { payload: compiled.payload, partial: compiled.partial };
    } catch (error) {
      if (generation === current) state = { error: error instanceof Error ? error.message : "编译失败" };
    }
  }
  await refresh();
  process.env.VITE_SITE_PREVIEW = "1";
  const server = await createServer({
    root, server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [root], deny: [".env", ".env.*", "**/.git/**", vault + "/**"] } },
    plugins: [{
      name: "private-local-content",
      configureServer(server) {
        server.watcher.add(vault);
        let timer: ReturnType<typeof setTimeout>;
        server.watcher.on("all", (_event, filename) => {
          if (!filename.startsWith(vault + path.sep) || filename.includes(path.sep + ".") || !/\.(md|yaml|png|jpg|svg|webp|gif)$/.test(filename)) return;
          clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 150);
        });
        server.middlewares.use("/interview-cards/__site/preview", (request, response) => {
          const origin = "http://" + request.headers.host;
          if (request.method !== "POST" || request.headers.origin !== origin || request.headers.host !== "127.0.0.1:" + port) {
            response.statusCode = 403; response.end(); return;
          }
          response.setHeader("Cache-Control", "no-store");
          const revision = '"' + digest(JSON.stringify(state.error ?? state.payload?.buildId ?? "pending")) + '"';
          response.setHeader("ETag", revision);
          if (request.headers["if-none-match"] === revision) { response.statusCode = 304; response.end(); return; }
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.statusCode = state.error ? 422 : 200;
          response.end(JSON.stringify({ ...state, workspaceId: digest(vault) }));
        });
      },
    }],
  });
  await server.listen();
  openBrowser();
  console.log("本机预览：http://127.0.0.1:" + port + "/interview-cards/ （保存笔记后自动刷新）");
  console.log(state.partial === false ? "完整题库已由笔记生成。" : "当前展示已迁移主题；完整预览可加 --with-legacy，发布始终要求解锁历史题库。");
  const shutdown = async () => { await server.close(); process.exit(); };
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
}
async function publish() {
  if (await git(root, ["status", "--porcelain"])) throw new Error("网站工程存在未提交改动；请先完成程序改动的审阅和提交，再发布内容。");
  if (await git(root, ["branch", "--show-current"]) !== "main") throw new Error("请先将本次程序改造合入本机 main，再使用内容发布入口。");
  await run("git", ["fetch", "origin", "main"]);
  if (await git(root, ["rev-parse", "--is-shallow-repository"]) === "true") await run("git", ["fetch", "--unshallow", "origin"]);
  const localHead = await git(root, ["rev-parse", "HEAD"]);
  const remoteHead = await git(root, ["rev-parse", "origin/main"]);
  if (localHead !== remoteHead) throw new Error("本机 main 与远端 main 不一致；先同步程序版本，再重新发布。");
  let password = await readHiddenLine("题库密码（沿用现有密码，仅本机使用）：");
  const second = await readHiddenLine("再次输入：");
  validatePublicationPasswords(password, second, () => console.log("建议使用至少 16 个字符的高强度口令。"));
  const legacy = await unlockLegacy(password);
  const site = await compileSite(vault, legacy);
  const released = parseCardsPayload(await decryptEnvelope(JSON.parse(await readFile(path.join(root, "public/cards.enc.json"), "utf8")), password));
  const changes = membershipChanges(membership(released), membership(site.payload));
  if (changes.removed.some((id) => !site.config.approvedRemovals.includes(id))) throw new Error("存在未经批准的卡片删除");
  console.log("变更：" + JSON.stringify(changes));
  const prepared = await prepareRelease(root, site, password);
  password = "";
  const restore = await replaceRelease(root, prepared.envelope, prepared.members);
  let committed = false;
  try {
    await run("npm", ["test"]);
    await run("npm", ["run", "typecheck"]);
    await run("npm", ["run", "test:local"]);
    await run("npm", ["run", "test:e2e"]);
    // The E2E task writes fictional data into dist: always rebuild before shipping.
    await run("npm", ["run", "build"]);
    await run("npm", ["run", "leaks:scan:public"]);
    await scanSiteRelease(root, site);
    await writeIndex(site);
    await run("git", ["add", "--", "public/cards.enc.json", "cards-membership.json"]);
    await run("git", ["commit", "-m", "chore: update encrypted learning content"]);
    committed = true;
  } catch (error) {
    await git(root, ["reset", "--", "public/cards.enc.json", "cards-membership.json"]).catch(() => undefined);
    await restore();
    throw error;
  }
  if (committed) {
    try { await run("git", ["push", "origin", "main"]); }
    catch { throw new Error("检查和本机提交已完成，推送未成功；保留该提交，可运行 git push origin main 重试。"); }
    console.log("已推送，GitHub Pages 将执行现有部署流程。");
  }
}
async function addCard() {
  const at = args.indexOf("--note");
  let relative = at < 0 ? "" : args[at + 1];
  if (!relative && process.stdin.isTTY) {
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try { relative = await input.question("请输入 01～09 内的笔记相对路径："); } finally { input.close(); }
  }
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..") || !/^0[1-9]-/.test(relative)) throw new Error("需要 --note 指定 01～09 内的笔记相对路径");
  const filename = path.join(vault, relative);
  const parsed = matter(await readFile(filename, "utf8"));
  const id = "card-" + randomUUID().slice(0, 18);
  parsed.data.site_doc_id ??= "note-" + randomUUID().slice(0, 18);
  const block = "\n\n%%card-id: " + id + "; priority: P1; decks: full%%\n### 新问题？\n\n> [!summary] 30 秒回答\n> 在这里填写简明口述答案。\n\n#### 深入理解\n\n在这里填写原理、表格或图示。\n\n%%card-end%%\n";
  const config = await readSiteConfig(vault);
  config.ownedCardIds.push(id);
  if (!config.ownedDocumentIds.includes(parsed.data.site_doc_id)) config.ownedDocumentIds.push(parsed.data.site_doc_id);
  await writeFile(filename, matter.stringify(parsed.content + block, parsed.data));
  await writeFile(path.join(vault, MAINTENANCE_DIRECTORY, "配置.yaml"), yaml(config));
  console.log("已插入带稳定 ID 的问答模板。");
}
async function main() {
  if (!vault || process.versions.node.split(".")[0] !== "24") throw new Error("需要 Node 24 和 --vault <知识库路径>");
  if (command === "init") return init();
  if (command === "preview") return preview();
  if (command === "publish") return publish();
  if (command === "index") return writeIndex(await compileSite(vault));
  if (command === "add-card") return addCard();
  throw new Error("用法：site <init|preview|publish|index|add-card> --vault <路径>");
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "维护失败"); process.exitCode = 1; });
