# 青青草原 · 狼堡

一套联动主题的独立浏览器预览。阳光草原上，狼堡收纳文件夹，拖出来的文件夹变成同名小羊。尚未上线，未接入 Windows 桌面宿主、官网或安装包。

在项目根目录运行 `npm run preview`，打开 <http://127.0.0.1:4175/previews/grassland/>。也可直接打开本目录的 `index.html` 查看主题，页头返回入口通过预览服务器使用。

## 操作

- 点击狼堡，拖动其中一个示例文件夹到右侧草原。
- 双击小羊查看文件夹内容，拖回狼堡或在查看窗口中点击“收回狼堡”。
- 小羊在草地范围内缓慢漫游并间歇停留，只左右转向，不整图旋转。支持暂停、后台暂停与系统减少动态偏好。
- 键盘聚焦文件夹或小羊，空格拿起、方向键移动、Enter 放下、Esc 取消；未拿起时 Enter 打开内容。
- “添加文件夹”使用浏览器目录选择器。内容仅留在当前页面内存；刷新后重置，不上传、移动或改写原文件。浏览器查看的是所选文件内容，不会打开资源管理器的原路径。文本与图片可预览，其他格式可下载副本。

## 素材与配置

运行素材在 `assets/`：`grassland.webp` 为背景，`wolfcastle.png` 和 `sheep.png` 为独立透明物件。原图保存在忽略目录 `output/imagegen/theme-grassland-*.png`；生成沿用获授权的 PP.dog / `gpt-image-2.5`，通过 imagegen 技能的 CLI 完成。物件用纯绿背景生成后经 `skills/wallpaper-theme/scripts/prepare_sprite.py` 抠图，检查浅色与深色底边缘。

提示词：[草原](../../prompts/theme-grassland-background.txt)、[狼堡](../../prompts/theme-grassland-wolfcastle.txt)、[小羊](../../prompts/theme-grassland-sheep.txt)。

`grassland.js` 的 `area()` 定义草原活动区域：桌面 `[0.36, 0.42, 0.94, 0.87]`，窄屏 `[0.15, 0.52, 0.9, 0.9]`，另扣除物件尺寸留边。漫游、暂停、文件夹状态与拖动行为均在同一文件中；`grassland.css` 定义场景与物件尺寸。

## 验证

2026-11-14 已通过 Edge 浏览器的拖出、双击查看、拖回、无效落点、Esc 取消、键盘操作、漫游、暂停与减少动态偏好检查；1920、1440、796、761、760、390、320 像素宽度无横向溢出，小羊及名称位于场景内。最终截图在 `output/playwright/grassland/final-desktop.png` 和 `final-mobile.png`。

使用带目录相对路径的 FileList 验证了嵌套文件、长目录名、HTML 纯文本展示、图片预览与下载副本。下载的二进制副本与测试内容逐字节一致。Playwright 向 Edge 目录输入传文件时超时，真实目录选择器尚待手工验收；未将注入 FileList 的检查当作真实选择目录验证。
