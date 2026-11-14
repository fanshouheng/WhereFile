# 创意工坊

第一版提供官网上传、即时预览、人工审核、公开预览及主题包下载。当前 Windows 0.1.3 不支持导入工坊主题；本次不修改桌面宿主或安装包。

## 当前发布状态

2026-11-14：已按用户选择改用 Cloudflare KV 免费额度，成功创建私有 namespace 并更新 D1 表结构。无需启用 R2 或绑定支付方式。KV 后台、素材/API 测试、接近大小上限的本地上传与 ZIP 解包均已通过；生产部署和线上验收待完成。

本地验收包括文件选择、背景与透明物件预览、运动及区域设置、上传回执、管理员私有预览、审核发布、回执更新、公开预览、ZIP 实际下载解包、反馈提交及管理员读取。手机断点 CSS 已实现；本轮内置浏览器的 viewport override 没有生效，实际手机尺寸视觉验证仍待完成。

## 本地开发

需要 Node.js 22+、Python（ZIP 兼容性测试）、Wrangler 4.161.0，以及已构建的 0.1.3 安装包。

```powershell
npm run site:build
npx wrangler@4.161.0 d1 execute wherefile-workshop --local --persist-to .wrangler/workshop-kv --file workshop/schema.sql
npm run workshop:dev
```

访问 `http://127.0.0.1:4178/workshop/`。`npm run site` 的 4177 是纯静态官网预览，不运行上传 API。避免同时运行多个占用 4178 的 Wrangler 实例。

本机 `.dev.vars` 包含 `WORKSHOP_ADMIN_TOKEN`（至少 32 字符）和 `WORKSHOP_RATE_SALT`（至少 16 字符）；本机 CLI 凭据在 `.local/workshop-admin.json`：`{"baseUrl":"https://wherefile.soul.xn--fiqs8s","token":"<密钥>"}`。两者均被 Git 忽略，不复制进网站或截图。密钥丢失时通过 Wrangler 更新生产 secret，并同步这两个本机文件。

```powershell
npm run check
npm run workshop:verify
npm run site:verify
```

`workshop:verify` 使用真实内存 SQLite 和模拟 KV，覆盖未审核内容隔离、回执及管理鉴权、撤下、限流、容量原子预留、同步延迟、存储失败回滚、分页、图片伪装/脚本/路径拒绝，以及 Python 实际 ZIP 解包。它不替代 Cloudflare 生产验收。CRC 使用 `node:zlib` 原生实现，Cloudflare 配置需保留 `nodejs_compat`。

## 上传与数据

- 背景为静态 PNG/JPEG/WebP，最多 8 MiB，至少 640×360，最长边 4096；透明物件为 PNG，最多 2 MiB，宽高 32–2048。
- 前端解码预览并检查透明像素；服务端检查真实容器、尺寸、PNG CRC/透明通道和静态格式，不执行上传代码，也不声称完成图片解码重编码。
- 仅接收固定结构的运动配置，不接收 HTML、JavaScript、SVG、远程素材地址或用户路径。包内固定为 `theme.json`、`background.png|jpg|webp`、`object.png`、`README.txt`。
- 昵称、介绍、来源和个人非商业使用范围会随作品公开。上传者须确认有权分享；审核仍需检查内容与授权。角色同人素材不自动作为已获授权的示例发布。
- 作品先存为 pending。KV 没有公共素材地址，仅审核通过的记录可经 API 获取图片或 ZIP。审核回执只持有随机查询凭证；数据库仅存其 SHA256。
- KV 跨区域同步可能需要 60 秒或更久；素材未就绪时返回 503 和 Retry-After，审核通过前确认两张素材可读取。网页图片加载失败可手动重试。
- KV 免费额度当前为账号共用 1 GB 存储、每日 100,000 次读和 1,000 次写；Workers/Pages Functions 免费动态请求每日 100,000 次。达到免费额度会限制请求，不会由本项目自动升级付费。核对账号其他服务的用量后再扩大投稿规模。
- 工坊在 D1 原子预留每份素材的大小，总容量最多 900 MiB（含未通过作品）；达到上限即停止新投稿。每天最多 200 份、每份两次 KV 写，预留写额度余量。写入清理失败或意外中断可能保守占用预留，需运维核对后处理；不自动清除投稿或旧现场。
- 每个网络来源每天最多 5 次投稿、20 次反馈，全站每天最多 200 次投稿。网络来源只保存加盐散列，不保存原始 IP。频次按 UTC 日重置，非法投稿尝试也会计数。
- 公共与审核列表每页 48 条，使用 offset 加载更多。反馈存入 D1，可用管理员 CLI 查看；本版不发送邮件或外部通知。
- 撤下后 API 拒绝新请求；图片缓存最长 60 秒，已下载到他人设备的副本无法远程撤回。

## 审核

网页入口为 `/workshop/?review`。在密码框输入管理员密钥，密钥只在当前页面内存使用。选择待审核主题后检查图片、来源及使用权，再选择通过或填写原因退回。已发布主题也可填写原因撤下。

CLI 默认连接生产；本地测试先设置 `$env:WHEREFILE_WORKSHOP_URL='http://127.0.0.1:4178'`。

```powershell
npm run workshop:admin -- list pending
npm run workshop:admin -- inspect <主题ID>
npm run workshop:admin -- approve <主题ID>
npm run workshop:admin -- reject <主题ID> "退回或撤下原因"
npm run workshop:admin -- reports
```

`inspect` 将待审核素材保存在忽略的 `output/workshop-review/<ID>/`，不打开外部浏览器。公开测试请使用明确的测试作品，验收后撤下；不要将同人或私人素材自动发布为原创。

## Cloudflare 部署

`wrangler.jsonc` 绑定 D1 `DB` 和 KV `THEME_ASSETS`。API 入口为 `functions/api/workshop/[[path]].js`，静态构建只复制网站与允许的预览资产；`_routes.json` 仅将 `/api/workshop/*` 送入 Functions，安装包保持静态下载。

首次配置使用 `npx wrangler@4.161.0 kv namespace create wherefile-workshop`，将返回 ID 写入配置；现有 namespace 已创建，更新时复用，不重复创建。

```powershell
npx wrangler@4.161.0 d1 execute wherefile-workshop --remote --file workshop/schema.sql
npx wrangler@4.161.0 pages secret bulk .dev.vars --project-name wherefile
npm run site:build
npm run workshop:verify
npm run site:verify
npx wrangler@4.161.0 pages deploy output/site --project-name wherefile --branch master
```

发布后须在自定义域名验证上传→私有回执→审核→公开预览→下载解包→反馈→撤下，并用接近 8 MiB 背景和 2 MiB 透明物件验证免费运行时，同时复核原安装包 SHA256；通过后更新本文的发布状态。
