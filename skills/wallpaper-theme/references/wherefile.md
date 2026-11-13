# WhereFile 接入参考

这是来源项目的适配线索，使用时在用户指定的仓库重新核对。技能不依赖仓库位于某个固定磁盘路径，也不自带素材、凭据或安装包。

## 制作入口

- `prompts/coast*.txt`、`prompts/boat*.txt`：正式手绘风景与船。
- `prompts/scene-space-surface.txt`、`scene-desert.txt`、`object-*.txt`：星球地表、沙海及对应物件。
- `previews/anime/*.txt` 与 `previews/interface/boats/*.txt`：二次元背景与配套船。
- `previews/interface/index.html`：九景独立设计预览，场景表和物件表在此。
- `scripts/prepare_boat.py`、`prepare_scene_objects.py`：来源项目的 Alpha 解混方法；固定文件路径与专属去色假设不能直接用于其他主题。

## 正式产品与设计预览

来源项目正式 `app.js` 注册 tropical、snow、autumn。其余六景是设计预览：

| ID | 主题 | 物件 |
|---|---|---|
| sakura | 樱花放学路 | 樱花划艇 |
| moonlight | 月色灯塔 | 月夜提灯舟 |
| oasis | 夏日海岸线 | 夏日汽艇 |
| bamboo | 藤花秘境 | 藤花篷船 |
| space | 星球边境 | 星际陨石 |
| desert | 风过沙海 | 小龙卷风 |

`previews/anime/` 放背景，`previews/interface/boats/<id>-cutout.png` 放专属物件。不要因名称含 bamboo/oasis 就自行改成竹林/绿洲，先以实际画面与场景表为准。

## 接入中的硬约束

- `ocean.js` 采用 1672×941 世界坐标和左岸右水域模型；海岸为 33 个等距纵向 x 采样，同一岸线驱动 CPU 命中/航行与 GPU 岸浪。新岸线需标定，不能因图片尺寸相同就沿用。
- `voyage.js` 选择可容纳物件的连续水域，结合物件大小留安全距离。修改大小、旋转或画幅后重新查边界。
- 原帆船朝屏幕右下约 35°，当前航向校正和方向映射基于此。新物件读取其真实朝向。
- 太空/沙海仅有 CSS 设计预览不代表正式着色器适配完成。需要独立的运动区域与渲染方式，不能往沙丘/星空直接叠海浪。
- 正式静态背景和动态水层分开，景物约 30 FPS，物件/交互独立更新；遵守页面隐藏、宿主挂起、暂停/恢复的既有链路。
- 真实桌面联动只改变图标显示，不移动、重命名或改写原文件。主题制作不需要操作真实桌面图标、重启 Explorer 或锁屏。

## 验证与展示

按项目 `AGENTS.md` 执行 `npm run check`，正式接入后针对性运行 `verify-wallpapers.cjs`、`verify-voyage.cjs`、`verify-motion.cjs`。只做浏览器预览时核对图片、路径范围、多个物件、暂停、大小、速度和窄屏。

官网在 `website/`，构建由 `scripts/site-build.mjs` 完成。静态主题卡片可用最终背景与专属物件合成 WebP 缩略图；统一标注“尚未上线”，不冒充安装包功能。只有请求官网发布时才更新并部署。打包、发布版本与实际桌面验收按项目规则另行处理。
