# WhereFile 桌面版验证

## 2026-11-13 状态核对

- GitHub 最新正式版为 [v0.1.2](https://github.com/fanshouheng/WhereFile/releases/tag/v0.1.2)，标签与远端 `master` 均指向 `f92bc16`。发布包尚未包含本地 `4970a56` 的按钮反馈及 Windows 11 层级修复；该修复提交尚未推送。
- 本地构建的五个网页入口文件与源码哈希一致；`output/desktop/WhereFile-Win11-layering-test.zip` 是供复测的测试包，不是正式发布。当前构建标识为 `win11-layering-20261113`。
- 本次重新通过语法、航行、三套壁纸边界、帧率/挂起、按钮反馈、资源访问及 `verify-desktop-host.ps1 -LayerOnly` 检查。`127.0.0.1:4173` 返回 WhereFile 页面，所服务的 `app.js` 与当前源码一致。
- 2026-11-13 用户反馈“真实win11测试没问题了”，据此将真实 Windows 11 复测标为通过。证据来自用户实机反馈，本次收尾未独立操作该机器；未记录其具体 Windows 11 版本、构建号或测试步骤，不扩大为所有 Windows 11 版本与交互的验收。
- 本次收尾未运行原生桌面宿主或操作真实图标，以下本机桌面交互与性能结果均为带日期的历史记录。包含修复的 0.1.3 安装包现已通过官网提供下载；GitHub Releases 仍为 0.1.2，修复提交尚未推送。
- `%LOCALAPPDATA%\HaiyuWallpaper` 是现用兼容数据目录，并非旧品牌残留。复测前先从托盘退出旧实例，再用 `host.log` 和 `status.json.hostBuild` 核对实际构建；不要删除用户数据来确认升级。

## 2026-11-13 单文件安装包 · 0.1.3

- 新增 `desktop/build-installer.ps1` 与 `desktop/installer.iss`，生成 `output/installer/WhereFile-v0.1.3-Setup-x64.exe` 和 `SHA256SUMS.txt`。安装包包含现有 Win11 层级修复，已通过官网提供下载，尚未上传 GitHub Releases。
- 当前用户安装，无需管理员权限，默认目录为 `%LOCALAPPDATA%\Programs\WhereFile`；创建开始菜单快捷方式和卸载入口。安装结束可选打开管理窗口，不自动切换壁纸或设置开机启动。
- 内含签名验证通过的 Microsoft WebView2 引导程序，缺少运行环境时联网安装。卸载保留 `%LOCALAPPDATA%\HaiyuWallpaper` 与共享 WebView2 Runtime；升级与卸载发送退出事件并等待实例结束，不强杀应用。
- 本机 Windows 10 的隔离目录静默安装返回 0；19 个程序文件与构建源逐文件哈希一致，开始菜单、版本 0.1.3、卸载入口均存在；静默安装未自动启动程序。中文安装标题与控件文字通过辅助功能接口读取，截图采集超时，未将界面截图验收记为通过。
- 用户已自行安装并启动此版本；覆盖升级、卸载及缺少 WebView2 时的联网安装分支尚未实测。

## 2026-11-13 官网与下载链路

- 官网源为 `website/`，构建输出为 `output/site`，本地预览 `127.0.0.1:4177`，独立于桌面软件。主画面使用项目正式素材，文件变船仅为网页互动示意，不读取访客文件。
- Playwright / Edge 验证了 1440、768、390、320 像素宽度无横向溢出，以及三景切换、暂停/播放、键盘与拖动变船、FAQ、减少动态偏好和图片加载；无页面错误。截图在 `output/playwright/wherefile-site-*-full.png`。
- 从页面实际下载的 0.1.3 EXE 大小为 6,191,283 字节，SHA256 为 `47ce1e2035b7b5913daf7755eb134b2fde32908862d73aac3d66e593c9a9cf2a`，与原安装包逐字节一致。`npm run site:verify` 另验证下载、HEAD、路径隔离和错误方法处理。
- Wrangler 4.161.0 的 Pages 本地运行确认两组响应头规则有效，EXE 返回附件下载；缺失页面和私有路径为 404，同样通过完整安装包下载哈希验证。
- Wrangler OAuth 已认证，2026-11-13 通过 Direct Upload 部署到 Cloudflare Pages 项目 `wherefile`，生产地址为 [https://wherefile-865.pages.dev/](https://wherefile-865.pages.dev/)。生产分支为 `master`，源码提交为 `df6b738`，部署 ID 为 `1289ce93-4cbd-49c3-a0fa-f8b8386e67fe`。
- 公网生产地址通过相同的 Playwright / Edge 布局及交互检查，覆盖 1440、768、390、320 像素宽度，图片全部加载，无页面错误。截图在 `output/playwright/wherefile-live-*-full.png`。浏览器真实点击下载的 EXE 大小和 SHA256 与上述本地安装包一致；独立 HTTP 下载、HEAD、附件及安全响应头、缺失路径与 `/.local/` 返回 404 的检查也通过，证据在 `output/live-verification/`。
- 官网新增六套静态主题预览，沿用设计稿的专属物件，统一标注“尚未上线”；图片压缩为 WebP，合计约 659 KiB。未将这些主题加入安装包，本地 1440、768、390、320 像素宽度检查及六张图片加载通过。
- `wherefile.soul.中国`（ASCII：`wherefile.soul.xn--fiqs8s`）已关联到 Pages。域名 DNS 由阿里云管理，需添加 `wherefile` 的 CNAME，目标为 `wherefile-865.pages.dev`；DNS 和 HTTPS 验证仍为 `pending`。现有 `pages.dev` 地址可直接访问及下载安装包。GitHub 源码提交与 0.1.3 Release 上传不属于本次官网部署。

## 2026-11-13 “设为桌面壁纸”无反馈排查

- 确认旧实现点击后无等待状态，附着失败只显示托盘气泡，且未检查窗口定位、显示 API 的返回值。这些是已确认的反馈和校验缺口，尚不能确定反馈用户电脑上的具体根因。
- 新增等待状态、重复提交保护、失败弹窗和 12 秒未确认提示；失败时先恢复管理窗口，允许重试。收到延迟成功确认后关闭超时提示。启动日志包含 Windows 和 WebView2 版本，原生异常保留详细信息。
- `npm run check`、`node scripts/verify-wallpaper-action.cjs`、`node scripts/verify-motion.cjs` 通过。行为测试覆盖原生失败、桥接异常、无响应、延迟成功和重试。
- Edge 真实浏览器通过模拟宿主消息检查等待、失败、关闭后重试及无响应弹窗，无控制台错误；截图在 `output/playwright/wallpaper-failure.png`。这是前端反馈验证，不代表在浏览器中完成系统壁纸设置。
- `scripts/verify-desktop-host.ps1` 通过：Windows 10 build 19045、WebView2 157.0.4341.46，使用与发布程序相同的清单，通过真实 WebView 页面按钮触发宿主，成功附着 WorkerW，文件变船、移动、换景和靠岸恢复通过。临时文件已清理，恢复记录为 `[]`。
- 回归期间最大化的前台应用曾触发预期的暂停，使移动测试失败。测试现暂时聚焦桌面并在结束后恢复先前前台窗口，测试期间没有关闭用户应用。
- 首次排查时尚缺反馈用户的 Windows 版本和日志；后续已收到 Windows 11 日志，分析见下一节；新版实机复测反馈见顶部状态核对。本机通过不等于已验证 Windows 11 各版本或对方的桌面层结构。

## 2026-11-13 Windows 11 日志跟进与层级修复

- 用户提供的日志确认多次 `SetParent` 返回 `win32Error=0`，实际父窗口为 `Progman`；状态为 `ready=true`、`mode=wallpaper`、`suspended=false`、`nativeVisible=true`、2560×1600、144 DPI、无异常。因此请求确已到达宿主，不能把现象归因于按钮未响应、缺少 WebView2 或 DPI 不一致。
- 旧实现找不到顶层 WorkerW 时回退至 Progman，并始终使用 HWND_BOTTOM。部分 Windows 11 的桌面图标和原壁纸 WorkerW 都是 Progman 的子窗口，放到底部会被原壁纸遮挡。用户旧日志没有记录子窗口结构，不能仅凭旧日志确认其机器确实命中这一分支；新版实机复测反馈见顶部状态核对。
- 按桌面结构选择附着方式：传统桌面保留独立 WorkerW；嵌套桌面使用不透明的 WS_EX_LAYERED 子窗口，紧邻图标层下方、原壁纸上方。完整桌面层不可用时返回错误，不再盲目回退 Progman。管理模式恢复原窗口样式。
- 使用 0x052C / 0xD / 1 请求桌面层，不成功时兼容旧参数；记录 Progman 样式、图标层、子 WorkerW、传统 WorkerW、选中的父窗口及插入位置。状态增加构建标识 `win11-layering-20261113`、分层样式和相邻窗口类名，方便确认实际运行的版本和层级。
- `scripts/verify-desktop-host.ps1 -LayerOnly` 验证传统布局、嵌套布局、存在无关顶层 WorkerW、桌面结构不完整及旧 Progman 错误回退。此测试验证布局选择，不等同于真实 Win11 的合成画面验收。
- 本机 Windows 10 build 19045 的真实 WebView 按钮 → WorkerW 附着 → 文件变船 → 动态位置 → 换景 → 恢复图标 → 回到管理窗口全部通过；恢复记录为空。此前两次移动测试受前台最大化应用触发暂停影响，测试现停止其测试实例的前台监测定时器、解除挂起，以单独检验桌面桥接；产品逻辑未禁用自动暂停，`verify-motion.cjs` 的挂起/恢复测试另行通过。
- 语法检查、按钮成功/失败/超时测试、布局选择测试和动态回归通过。生成 `WhereFile-Win11-layering-test.zip` 供对方复测，未发布为正式版本，也未将本机结果表述为真实 Win11 验收。
- 桌面结构依据：[Lively 中记录的 Windows raised desktop 结构说明](https://github.com/rocksdanister/lively/blob/core-separation/src/Lively/Lively/Core/WinDesktopCore.cs)。仅参考窗口结构与 Win32 API 行为，未引入第三方源文件或依赖。
- 对方复测时必须先从托盘退出旧版，再完整解压并运行新版。单实例程序直接打开第二个 EXE 只会唤起旧实例；应以新日志和 `status.json` 中的 `hostBuild` 确认升级。

## 2026-11-10 初始桌面验证

- `npm run check` 通过。
- `verify-voyage.cjs` 通过：1440×900、1920×1080、3840×2160、390×844；普通与壁纸模式十分钟覆盖至少 8/9 海域及横纵 70% 范围，持续巡航、无风停航、低帧率、强风避岸通过。
- `verify-motion.cjs` 执行实际帧函数：1/15/60 FPS 均准确推进八秒，最大位置差 0.038px；暂停、宿主挂起与恢复、窄屏强风通过。
- `verify-server.cjs` 通过：本地资源可访问，配置目录与编码路径穿越被拒绝。
- 内置浏览器实际检查了航行位移、播放/暂停、画面及控制台；没有页面错误。

原生实测使用本机 Windows x64 和已安装的 WebView2 Runtime。首次版本的窗口重建导致 SetParent 失败，已改为原生样式切换并消除失败重入。

- 最终 EXE 无编译警告，15 文件白名单打包，不含密钥、生成工具或旧参考图。
- 成功嵌入 WorkerW，SetParent Win32Error=0，实际父句柄匹配。
- 主屏画布 1920×1080。相隔约 21 秒的 CapturePreview 图中，小船驶向了不同海域，海面与海洋生物持续变化。
- 壁纸与管理切换保留同一窗口句柄和 WebView 页面；管理窗口位于屏幕内，系统可见并获得焦点。
- 从壁纸模式退出后，进程结束，状态为 running=false、parent=0，未改写系统壁纸配置。

截图、状态快照存放于忽略目录 `output/desktop-check/`。CapturePreview 是宿主页内容，不包含 Windows 桌面图标叠层。当前 CUA 的原生截图超时、点击缺少坐标，故未将托盘鼠标交互和桌面图标叠层截图记为已通过；原生附着/管理/退出通过软件自身命令和 Win32 状态验证。全屏/锁屏暂停的前端挂起逻辑已测试，未为测试而锁定用户电脑或重启 Explorer。

## 2026-11-11 真实桌面文件联动

- Shell COM 读取真实桌面文件、文件夹和快捷方式，系统虚拟图标暂不转换。
- 通过桌面图标窗口区域裁剪实现视觉隐藏，不改原文件路径、内容和属性；键盘查找仍可能选中隐藏图标。
- verify-desktop.ps1 通过：临时桌面文件显示裁剪、原位置恢复、其他图标和文件内容不变，临时文件已清理。
- verify-desktop-host.ps1 通过：真实 WebView2 接收文件转换，原生船窗口可见并持续移动，岸边 drop 消息恢复原图标，最终恢复记录为空。
- 集成测试通过内部桥接发送转换和靠岸消息，未将鼠标手势、双击打开和窗口层级视觉效果记为已验收。CUA 未暴露桌面图标层，仍需实际交互确认。
- 语法、帧率一致性、挂起、暂停和全海域巡航回归通过。桌面版取消示例船，加入独立异常退出恢复进程。

## 2026-11-11 重启后漏检修复

原监听依赖按下鼠标时前台类名为 Progman/WorkerW，并只在松手首轮检查位置。Explorer 延后提交位置或前台仍是其他应用时，变化会被当作新基线而丢失。改为松手后持续对比 Shell 位置，进入壁纸模式立即读取基线。

更新 verify-desktop-host.ps1 测试，不再直接注入 desktop-capture：从管理模式启动，切壁纸，通过 Shell 移动临时文件图标，验证真实轮询、海域判断、隐藏、巡航与靠岸恢复。连续两次独立进程测试通过，恢复记录为空。测试仍使用 Shell API 移动而非 CUA 鼠标手势。

## 船头与随机漂流

船体按实际速度向量旋转，校正原画船头向右下约35度；角度跨越360度时连续，尾迹位于速度反方向。原生绘制扩大透明画布以避免旋转裁边，文件名不随船旋转。
随机巡航按每船独立种子洗牌九个海区，区内随机选点，每轮重新洗牌。测试验证船头与速度对齐、海区顺序/选点独立、十分钟覆盖、低帧率一致性与避岸。原生图标隐藏、移动及恢复回归通过。测试临时解除暂停以验证移动并恢复暂停状态。

## 精简功能

已移除截图、录屏、预览导出命令及 FFmpeg 调用。保留文件变船、全海域漂流、回岸恢复、暂停和管理功能；历史验证图片记录仅供开发参考。
