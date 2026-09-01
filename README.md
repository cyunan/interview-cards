# 私有面试卡片

一个移动端优先的离线 PWA。应用代码公开托管在 GitHub Pages，题目与回答只以 AES-256-GCM 密文进入仓库；正确密码仅在浏览器内存中用于解锁。

## 本地开发

需要 Node.js 24。

```bash
npm ci
npm run dev
```

开发服务器地址包含固定子路径：`http://localhost:5173/interview-cards/`。

## 题库检查与发布

私有知识库保持在公开仓库之外。所有命令都通过显式路径读取它，发布密码由本地终端隐藏输入两次，不接受命令行参数或环境变量。

```bash
npm run cards:lint -- --vault <vault-path>
npm run cards:build -- --vault <vault-path>
npm run verify:vault -- --vault <vault-path>
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
- Service Worker 只缓存应用资源和 `cards.enc.json`；解密后的卡片只存在于当前页面内存。
- 学习进度只保存在 IndexedDB，导出文件不包含题目与回答。
- 公开密文可以被下载并离线尝试破解，因此发布密码至少需要 8 个 Unicode code point；8–15 个会在发布前明确警告，建议使用至少 16 个字符的高强度口令。
- 忘记密码无法恢复。旧密码泄露时，仅更换新版本密码不能保护 Git 历史中的旧密文，需要重建公开仓库历史或迁移到新仓库。

## 部署

`main` 分支推送后，GitHub Actions 会执行 `npm ci`、单元测试、Chromium/WebKit 离线流程、重新生产构建、隐私扫描并部署 `dist`。构建任务只有仓库只读权限，Pages 写入与 OIDC 权限只授予不执行仓库代码的部署任务。Vite 的固定基础路径是 `/interview-cards/`，目标地址为：

<https://cyunan.github.io/interview-cards/>
