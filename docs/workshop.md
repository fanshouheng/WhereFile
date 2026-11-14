# 创意工坊

第一版提供官网上传、即时预览、人工审核、公开预览及主题包下载。当前 Windows 0.1.3 不支持导入工坊主题；本次不修改桌面宿主或安装包。

## 当前发布状态

2026-11-14：已按用户选择改用 Cloudflare KV 免费额度并上线，无需启用 R2 或绑定支付方式。代码版本 `87b55ae`，Cloudflare Pages 部署 `https://40bdf28b.wherefile-865.pages.dev`，正式入口为 `https://wherefile.soul.中国/workshop/`。本机 Git 的后续文档提交不代表新增部署。

线上已用内置浏览器验证文件选择、即时预览、上传回执、管理员私有预览、审核发布、回执更新、公开预览和真实 ZIP 下载；下载包与原始素材、CRC 均一致。已发布官方 AI 素材示例“海湾慢行”（ID `cf16fd87-0aa0-4e6e-89f7-17dd2483eebc`）。待审详情/素材/下载返回 404，未授权审核返回 401。程序生成的 8,344,780 字节背景与 2,086,598 字节物件也通过线上上传、审核、10,432,695 字节 ZIP 解包、反馈及管理员读取；测试作品已撤下，详情/素材/下载均恢复 404，保留私有审核记录与素材。

生产安装包仍为 6,191,283 字节，SHA256 `47ce1e2035b7b5913daf7755eb134b2fde32908862d73aac3d66e593c9a9cf2a`；青青草原官网预览也返回 200。截图在忽略的 `output/playwright/workshop-kv/live-gallery-iab.jpg`。手机断点 CSS 已实现；本轮内置浏览器的 viewport override 没有生效，实际手机尺寸视觉验证仍待完成。

免费额度的计算时间仍是运行边界：官方标注每请求 10 ms，并允许偶发超限；持续超限可能返回 1102。线上日志中示例约 0.96 MB 上传为 16 ms，大图上传为 132 ms、下载为 19 ms，均本次成功且无异常。这证明本次流程可用，不证明持续大图投稿负载可靠。账号订阅只读查询返回 403，不能推断已经是付费套餐。第一版适用于少量投稿；持续大图负载需减少 multipart 解析/单次处理量后再验收，不能靠购买方案或重试掩盖。参考 [Workers CPU 限制](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)。

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

## 下载统计

管理员在 `/workshop/?review` 登录后查看安装包和主题包的累计、今日、近 7 天请求次数，可手动刷新，并展开累计最多的 100 个版本或主题。CLI：`npm run workshop:admin -- stats`。私有接口 `GET /api/workshop/moderation/stats` 复用管理员鉴权，返回汇总、近 7 天每日数据与明细，禁止缓存；不向访客公开。

统计从功能上线后开始，历史下载无法补算。数据在 D1 `download_counts` 按北京时间的日期、类型与版本/主题 ID 原子累计；重复请求会累计，不记录 IP、Cookie 或设备标识，也不代表唯一用户、传输完成或安装成功。HEAD、显式预取/预渲染、未通过或已撤下主题以及打包失败不计数；统计写入失败时保留下载响应，可能少计。

官网安装按钮请求 `GET /api/workshop/downloads/installer`，从当前部署的 `/download.json` 读取地址、计数并返回禁止缓存的 302，再由 Pages 静态文件服务发送 EXE。每次计数增加一次 Functions 请求和一次 D1 upsert，占用账号共用免费额度；安装包字节仍走静态服务，不读取 KV。直接访问或分享 `/downloads/*.exe` 会绕过统计。本地 `npm run site` 纯静态服务通过响应头标识预览环境，继续直接下载、不记统计；`workshop:dev` 提供完整统计路径。

主题下载在现有 ZIP 接口打包成功后计数，仍需两次 KV 读取。免费额度内不能承诺无限次带统计下载；D1/Functions 限额和持续大图 CPU 边界同样适用。数据库计数故障不阻断下载，但平台本身拒绝动态入口时，不能保证该入口仍然可用。

## Cloudflare 部署

`wrangler.jsonc` 绑定 D1 `DB` 和 KV `THEME_ASSETS`。API 入口为 `functions/api/workshop/[[path]].js`，静态构建只复制网站与允许的预览资产；`_routes.json` 仅将 `/api/workshop/*` 送入 Functions。安装包的统计入口经过 Functions 后跳转，文件本体保持静态下载。更新统计功能前先执行下方幂等 schema 命令，只新增计数表，保留既有投稿与历史统计。

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
