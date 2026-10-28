# 私有面试卡片

一个移动端优先的离线 PWA。应用代码公开托管在 GitHub Pages，题目与回答只以 AES-256-GCM 密文进入仓库；正确密码仅在浏览器内存中用于解锁。

## 本地开发

需要 Node.js 24。

```bash
npm ci
npm run dev
```

开发服务器地址包含固定子路径：`http://localhost:5173/interview-cards/`。

## 单篇笔记维护入口

Node 24 下首次初始化：

~~~bash
npm ci
npm run site -- init --vault <vault-path>
~~~

初始化在知识库生成本机预览与发布启动入口，并冻结现有密文作为迁移兼容来源。正文、资料收录和路线配置由知识库维护。新格式按显式的 site_doc_id 与隐藏 card-id 标记发现，不依赖文件名。普通标题和总结不会自动收录。

~~~bash
npm run site -- preview --vault <vault-path>
npm run site -- preview --vault <vault-path> --with-legacy
npm run site -- add-card --vault <vault-path> --note <relative-note.md>
npm run site -- index --vault <vault-path>
npm run site -- publish --vault <vault-path>
~~~

默认预览仅显示已迁移内容，页面会明确标注；完整预览通过终端隐藏输入密码解锁历史题库。保存笔记会重新编译，错误时提示并保留上次成功画面。预览绑定本机回环地址、使用独立进度、不注册生产 Service Worker，私有内容不会写入公开静态目录。

发布必须在干净且与远端同步的 main 上进行。它解锁冻结快照，与明确登记接管的卡片合并，检查具体成员变化、路线引用、单元测试、手机浏览器及离线流程和公开产物与可达历史的明文风险，再提交密文与成员基线并推送。检查失败恢复原产物，推送失败保留可重试提交。已有卡片 ID 与旧版载荷继续兼容。

新载荷 cards-v3 在现有加密封装内携带卡片、技术资料和学习路线；cards-v1/cards-v2 使用旧路线作为兼容回退。新入口替代下方旧格式的手动发布步骤；旧命令保留供未迁移的规范题库使用。

## 题库检查与发布

私有知识库保持在公开仓库之外。所有命令都通过显式路径读取它，发布密码由本地终端隐藏输入两次，不接受命令行参数或环境变量。

题库内容有任何修改时，必须先重新编译并生成新的密文，再进行前端验证和推送；只运行 `npm run build` 不会读取私有知识库，也不会更新线上题目。

路线页的“本阶段技术资料”也在同一次编译中生成。资料清单维护在
`src/content/reference-docs.ts`，构建器按相对路径从小陈空间读取选定的技术笔记，去除图片依赖并随题库一起加密；公开仓库和 `dist` 中不会出现原始 Markdown。新增资料时先更新清单和对应路线阶段，再重新执行 `cards:build`。

```bash
# 1. 检查私有文档
npm run cards:lint -- --vault <vault-path>

# 2. 重新编译、加密并原子替换公开密文（必须执行）
npm run cards:build -- --vault <vault-path>

# 3. 检查题库指纹、公开工作树和 Git 历史
npm run verify:vault -- --vault <vault-path>

# 4. 确认密文确实变化后，再运行前端验证
npm run verify
npm run test:e2e

# 5. 仅提交密文和必要的前端改动，再推送触发 Pages
git diff -- public/cards.enc.json
git add public/cards.enc.json <frontend-files>
git commit
git push origin main
```

`cards:build` 只会原子替换 `public/cards.enc.json`，不会提交或推送。确认完整验证通过后，再自行提交生成的密文。

## 验证

```bash
npm run verify
npm run test:e2e
```

- `verify`：单元测试、类型检查、生产构建与公开产物隐私扫描；缺少合法的 `public/cards.enc.json` 会直接失败。
- `verify:vault`：额外用私有题库指纹检查公开工作树、`dist` 和所有可达 Git 历史，阻止题目、回答、来源文件名或个人联系信息进入公开仓库。
- `test:e2e`：用纯虚构加密夹具验证 Chromium 与 WebKit 的手机流程、触控尺寸、冷启动锁定和离线解锁。

## 安全边界

- PBKDF2-HMAC-SHA256（600,000 次、16 字节随机盐）派生 AES-256-GCM 密钥，每次发布使用新的 12 字节 IV。
- Service Worker 只缓存应用资源和 `cards.enc.json`；解密后的卡片只存在于当前页面内存。勾选“记住此设备”后，仅将当前版本的不可导出 `CryptoKey` 和公开版本元数据保存到 IndexedDB，不保存密码或解密后的卡片。
- “锁定”会清除内存中的题库并删除本机记忆；题库重新发布后盐值变化，通常需要重新输入一次密码。
- 学习进度只保存在 IndexedDB，导出文件不包含题目与回答。
- 公开密文可以被下载并离线尝试破解，因此发布密码至少需要 8 个 Unicode code point；8–15 个会在发布前明确警告，建议使用至少 16 个字符的高强度口令。
- 忘记密码无法恢复。旧密码泄露时，仅更换新版本密码不能保护 Git 历史中的旧密文，需要重建公开仓库历史或迁移到新仓库。

## 部署

`main` 分支推送后，GitHub Actions 会执行 `npm ci`、单元测试、Chromium/WebKit 离线流程、重新生产构建、隐私扫描并部署 `dist`。构建任务只有仓库只读权限，Pages 写入与 OIDC 权限只授予不执行仓库代码的部署任务。Vite 的固定基础路径是 `/interview-cards/`，目标地址为：

<https://cyunan.github.io/interview-cards/>
