# WhereFile

把真实桌面文件变成漂流小船的 Windows 动态壁纸；网页导入的是本地副本，桌面联动只覆盖主显示器。

## 运行与验证

- 技术栈：原生 JavaScript / WebGL、Node.js 18+ 静态服务器、C# WinForms / WebView2 / .NET Framework 4.6.2+。
- `npm start`：正式网页，`http://127.0.0.1:4173`；无需安装 npm 依赖。
- `npm run preview`：独立设计预览，`http://127.0.0.1:4175/previews/interface/`。
- `npm run site`：官网与真实安装包下载，`http://127.0.0.1:4177`；`npm run site:build` 输出 `output/site`，`npm run site:verify` 验证下载及路径隔离。官网源在 `website/`，Cloudflare Pages 配置在 `wrangler.jsonc`。
- `npm run workshop:dev`：创意工坊完整服务，`http://127.0.0.1:4178/workshop/`；需先构建官网及初始化本地 D1。`npm run workshop:verify` 验证素材、API 与 ZIP。部署/审核及发布状态见 `docs/workshop.md`。
- 桌面构建：`powershell -NoProfile -ExecutionPolicy Bypass -File desktop/build.ps1`；输出 `output/desktop/WhereFile/WhereFile.exe`，`-SkipZip` 可跳过压缩。
- 单文件安装包：`powershell -NoProfile -ExecutionPolicy Bypass -File desktop/build-installer.ps1`；输出 `output/installer/WhereFile-v<版本>-Setup-x64.exe`。安装到当前用户目录，卸载保留兼容数据目录。
- 基础检查：`npm run check`，以及 `node scripts/verify-voyage.cjs`、`node scripts/verify-wallpapers.cjs`、`node scripts/verify-motion.cjs`、`node scripts/verify-wallpaper-action.cjs`。
- 资源访问检查：先启动正式网页，再执行 `node scripts/verify-server.cjs`。
- 桌面构建后可执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-desktop-host.ps1 -LayerOnly`，仅验证布局选择。
- 不带 `-LayerOnly` 的宿主测试和 `scripts/verify-desktop.ps1` 会操作真实桌面图标；只在明确允许桌面交互的任务中执行。

## 目录与边界

- `app.js` / `ocean.js` / `voyage.js`：页面、海面和航行；`desktop/`：原生宿主、文件联动与构建。
- `assets/` 是正式素材；`previews/` 的九景设计独立于正式产品的三套壁纸；`prompts/` 与 `scripts/` 用于素材和验证。
- `docs/desktop-verification.md` 记录版本与平台验证边界；`docs/performance.md` 记录性能样本及限制。截图与构建不是实际桌面交互验收。
- 真实桌面联动只改变图标显示，不移动、重命名、删除或改写原文件；保持退出及异常恢复链路。
- `HaiyuWallpaper` 数据目录、单实例事件、`haiyu.local`、`tidal-desktop` 与 `island-*` 存储键用于兼容旧数据，不作批量品牌替换。
- `.local/` 含本机凭据与历史备份；`output/` 是构建、原始素材及验证现场。保持 Git 忽略，不将凭据、用户数据或参考提取素材放入仓库/发布包。
- 工坊后台在 `workshop/` 与 `functions/`，使用私有 KV 和 D1 免费额度；`.dev.vars`、`.local/workshop-admin.json` 是本机凭据。用户主题只允许数据配置与静态位图，待审核素材不得公开；Windows 客户端尚不支持工坊主题导入。
- 生图是可选外部 API 操作，不为文档审计调用。删除旧素材、测试现场或分支前，先汇报候选并等待确认。

## 当前状态与下一步

- Windows 11 桌面层级修复的构建标识为 `win11-layering-20261113`；2026-11-13 用户反馈真实 Windows 11 测试通过，具体证据与发布状态见桌面验证记录。
- 正式发布、远端提交和本机运行态需重新核对；升级复测先退出旧实例，再检查 `status.json.hostBuild`，避免单实例唤起旧版。
