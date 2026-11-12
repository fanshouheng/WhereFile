# 太空与沙漠的风格对照

三组静态概念图，包含同画风的示例陨石或旋风，用来比较视角、材质与融合效果。

最新太空构图为「站在星球表面」：左侧与左下是近处岩石，地表向远方展开，右侧留出星空。已用于独立主界面里的「星球边境」预览。[最终背景](../anime/space-surface.webp)由 PP.dog `gpt-image-2.5` API 生成，实际尺寸 1672×941，[提示词](../../prompts/scene-space-surface.txt)随素材保存。原始 PNG 为 `output/imagegen/scene-space-surface.png`。

运行 `npm run preview` 后，打开 http://127.0.0.1:4175/previews/style-exploration/ ，点击图片放大。

| 风格 | 太空素材 | 沙漠素材 | 提示词 |
| --- | --- | --- | --- |
| 微缩漫游 | [space-miniature.webp](assets/space-miniature.webp) | [desert-miniature.webp](assets/desert-miniature.webp) | [太空](../../prompts/scene-space-miniature.txt) / [沙漠](../../prompts/scene-desert-miniature.txt) |
| 线绘游戏地图 | [space-lined.webp](assets/space-lined.webp) | [desert-lined.webp](assets/desert-lined.webp) | [太空](../../prompts/scene-space-lined.txt) / [沙漠](../../prompts/scene-desert-lined.txt) |
| 精细像素地图 | [space-pixel.webp](assets/space-pixel.webp) | [desert-pixel.webp](assets/desert-pixel.webp) | [太空](../../prompts/scene-space-pixel.txt) / [沙漠](../../prompts/scene-desert-pixel.txt) |

使用 PP.dog `gpt-image-2.5` API，通过 Codex 自带的 `imagegen/scripts/image_gen.py` CLI 生成。六张原始图片的实际尺寸均为 3344×1882，原始 PNG 保存在 `output/imagegen/scene-<主题>-<风格>.png`，本目录的 WebP 为最终预览素材。

生成命令示例：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/imagegen.ps1 -Action Generate -Asset scene-space-miniature`。每个名称请求一张完整场景，生成后转为 WebP。`comparison.jpg` 是六张图的总览。
