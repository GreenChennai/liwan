# Liwan — 截图

本文档介绍截图库、截图的采集方式，以及用于生成已填充视图的种子数据。

---

## 前置条件

```bash
# 安装 npm 依赖（包括 Playwright）
npm install

# 安装 Playwright 的 Chromium 浏览器
npx playwright install chromium

# 构建前端（截图工具使用编译好的二进制文件 + dist/）
npm run build:frontend
```

---

## 采集截图

```bash
npm run screenshots
```

截图工具是自包含的，它会：
1. 将演示数据文件写入 `/tmp/vulos-demo-data/`（从不触及 `./data`）
2. 构建 Go 二进制文件（通过 `//go:embed` 嵌入前端）
3. 在 8083 端口启动该二进制文件，并指向演示数据目录
4. 以 1440×900 @2x（视网膜屏）截取每个界面，同时保存**浅色和深色**两种版本——Liwan 以浅色为先，因此每个界面都会同时截取 `<name>-light.png` 和 `<name>-dark.png`
5. 停止服务器

若要针对已部署的实例进行采集：

```bash
BASE_URL=https://office.example.com npm run screenshots
```

---

## 种子数据

演示数据提交在 `scripts/seed-demo.mjs` 中，且从不触及 `./data`——它使用位于 `/tmp/vulos-demo-data` 的临时目录。

| 界面 | 种子内容 |
|---------|-------------|
| **Docs** | “Q2 2026 Product Update”——标题、正文段落、项目符号列表、表格；“ADR-014: Sync Layer”——决策记录 |
| **Sheets** | “Revenue Tracker H1 2026”——6 个月 × 5 列，SUM 与利润率公式，2 个工作表 |
| **Slides** | “Liwan Product Overview”——5 页幻灯片，Reveal.js obsidian 主题 |
| **Whiteboards** | “Liwan — Architecture Sketch”——Excalidraw 场景：带标签的方框 + E2E/中继箭头 |

---

## 路由列表

每个路由都会被截取两次——`<name>-light.png` 和 `<name>-dark.png`。

| 文件（浅色 / 深色） | 路由 | 界面 | 是否有数据？ |
|---------------------|-------|---------|------------|
| `home-*.png` | `/` | 首页 / 工作区 | 有——种子最近项目 + “Start something new” |
| `apphome-docs-*.png` | `/docs` | Docs 文件列表 | 有——种子文档 + 本地磁盘扫描 |
| `docs-editor-*.png` | `/docs/demo` | 文档编辑器 | 有——带正文和表格的 Q2 Product Update |
| `sheets-editor-*.png` | `/sheets/demo-sheet` | 电子表格编辑器 | 有——带公式的 Revenue Tracker |
| `slides-editor-*.png` | `/slides/demo-slides` | 演示文稿编辑器 | 有——5 页产品概览 |
| `whiteboard-editor-*.png` | `/whiteboards/demo-board` | 白板编辑器（Excalidraw） | 有——真实画布上的架构草图 |
| `pdf-editor-*.png` | `/pdf/demo` | PDF 查看器/批注工具 | 部分——仅 UI 外壳（打开 PDF 的空状态） |
| `settings-*.png` | `/settings` | 设置 | 有——账户 / 存储 / 管理 |

README 首图使用 `home-light.png`；图库以浅色截图为主，并展示浅色/深色的成对截图。

---

## 图库

### 首页 / 工作区

![Home — light](screenshots/home-light.png)
![Home — dark](screenshots/home-dark.png)

Liwan 工作区——“Start something new”启动入口、种子最近项目以及本地磁盘扫描——分别以温暖的浅色主题及其对应的深色主题呈现。

### Docs 文件列表

![Docs file list](screenshots/apphome-docs-light.png)

Docs 应用首页：以卡片形式展示最近文档，并附带“在你的电脑上”的文件扫描。

### Docs 编辑器

![Docs Editor — light](screenshots/docs-editor-light.png)
![Docs Editor — dark](screenshots/docs-editor-dark.png)

文档编辑器（TipTap）打开了“Q2 2026 Product Update”——Fraunces 字体的“纸张”效果、标题、一个指标表格以及项目符号列表。

### 电子表格编辑器

![Sheets Editor](screenshots/sheets-editor-light.png)

电子表格编辑器（Fortune Sheet）展示“Revenue Tracker H1 2026”——6 个月的收入、支出、利润（SUM 公式）以及利润率 % 列。

### 演示文稿编辑器

![Slides Editor](screenshots/slides-editor-light.png)

演示文稿编辑器打开了 5 页的“Liwan Product Overview”演示稿——包含母版、主题、切换效果以及演讲者视图。

### 白板编辑器

![Whiteboard Editor](screenshots/whiteboard-editor-light.png)

白板编辑器——基于 MIT 许可的 [Excalidraw](https://github.com/excalidraw/excalidraw) 画布，运行在 Liwan 自有的分布式点对点协作引擎之上（与 Docs 使用的是同一个 Yjs/端到端加密房间，没有中央白板服务器）。图中打开的是种子数据“Architecture Sketch”。注意顶部栏中的“Excalidraw · MIT”署名。

### PDF 编辑器

![PDF Editor](screenshots/pdf-editor-light.png)

PDF 查看器，带有批注和签署工具，图中显示的是“打开 PDF”的空状态。（必须打开或上传一个 PDF 文件才能显示内容——种子数据中不包含预加载的 PDF。）

### 设置

![Settings](screenshots/settings-light.png)

独立设置——账户、存储、主题（浅色 / 深色 / 跟随系统）以及管理。

> **日历和通讯录**已迁移至邮件连接器——它们的截图和种子数据现在位于 lilmail 中，而不在此处。
