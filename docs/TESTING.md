# 前端测试 — Liwan

React 应用由两层互补的测试覆盖。两层都是封闭的（无 Go 后端，无中继）：API 接口均被模拟。

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1 — Vitest (jsdom)            npm test                         │
│   • unit tests (helpers, CRDT, exporters, pure logic)               │
│   • RTL + MSW integration: real component trees (real TipTap editor, │
│     real HistoryPanel/CommentsPanel/SuggestionPanel, real api client)│
│     with /api served by Mock Service Worker (msw/node).             │
│   • runs everywhere, fast, no browser.                              │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2 — Playwright (chromium)     npm run test:e2e                 │
│   • real browser against a production `vite preview` build.         │
│   • the entire backend is mocked in-browser via page.route.         │
│   • covers the flows jsdom cannot: the @fortune-sheet canvas grid,  │
│     reveal.js rendering, real toolbar + menu interaction.           │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3 — Real P2P integration      npm run test:e2e:p2p             │
│   • NOTHING mocked, and nothing external: one real liwan binary     │
│     serving its OWN discovery surface + two real browsers + real    │
│     WebRTC. Cannot be skipped — it depends on this repo only.       │
│   • proves peer-to-peer collaboration with no other product at all. │
│   • plus an optional suite for the external-relay posture, which    │
│     skips (loudly) unless VULOS_RELAYD_BIN names a prebuilt relayd. │
│   • separate config/job so it cannot destabilise layers 1–2.        │
└─────────────────────────────────────────────────────────────────────┘
```

## 运行

### 第 1 层 — Vitest（无需设置，即可运行）

```bash
npm test                      # 整个测试套件
npx vitest run src/__tests__/msw/           # 仅 MSW 集成测试
npx vitest                    # 监听模式
```

MSW 集成测试位于 `src/__tests__/msw/`：

| 文件 | 覆盖内容 |
|------|--------|
| `versionHistory.integration.test.jsx` | 快照列表 + 恢复；**wave-14** 角色门控（拒绝 viewer/commenter，允许 owner/editor） |
| `comments.integration.test.jsx` | 添加 / 解决 / 重新打开 / 回复，标签页筛选 |
| `suggestions.integration.test.jsx` | 创建 / 接受 / 拒绝，状态 PUT 往返 |
| `docsEditor.integration.test.jsx` | **真实 TipTap**——输入顺序（不出现 "olleh"），**wave-19** 字号/字体，粗体/标题/列表/链接，导出菜单（DOCX/PDF/MD） |
| `p2pShare.integration.test.jsx` | **wave-25** 分享对话框，邀请解析为房间，只读拒绝，E2E 加密封装，两个会话的收敛 |
| `slidesEditor.integration.test.jsx` | **完整挂载 SlidesEditor**——打开、添加幻灯片、重新排序、演讲者切换、在线状态标签 |
| `sheetsEditor.integration.test.jsx` | 通过 SheetsFindReplace 完成单元格编辑往返，在线状态标签推导 |

**模拟的工作方式。** `src/__tests__/msw/handlers.js` 是一个小型的、*有状态的*内存后端（文件、版本、评论、修改建议）。`resetMock({ role })` 为每个测试重新播种数据；`role` 会切换服务端的恢复门控。请求会流经*真实的* `src/lib/api.js` 客户端 → `fetch` → MSW。CRDT 存储（`getCommentStore`、`getSuggestionStore`）是模块级单例，因此测试在 `beforeEach` 中调用 `evict*Store()`，以避免测试之间的状态泄漏。

### 第 2 层 — Playwright（一次性浏览器安装）

```bash
npx playwright install --with-deps chromium   # 只需一次
npm run test:e2e                              # 构建 vite，提供 preview 服务，运行测试
npm run test:e2e:ui                           # 交互式 UI 模式
```

`pretest:e2e` 会先运行 `vite build`；随后 `playwright.config.js` 通过 `vite preview` 在端口 **47317** 提供构建产物（这是一个不常见的端口，并且 `reuseExistingServer: false`，因此在共享端口上残留的其他 Vulos 应用预览永远不会被误测）。Service Worker 被阻止，以免缓存的 PWA 外壳遮蔽模拟数据。

**模拟的工作方式。** `e2e/fixtures.js` 安装了一个 `page.route('**/api/**')` 处理器，镜像了 MSW 后端（认证、文件、带 wave-14 门控的版本、评论、修改建议）。`officePage` fixture 会自动挂载它；`installBackend(page, { role })` 允许测试为恢复门控选择角色。

### 第 3 层 — 真实 P2P 集成（`npm run test:e2e:p2p`）

这是**完全没有模拟**的一层。它之所以存在，是因为本仓库的核心架构主张——*两个人通过一个单独的 `liwan` 二进制文件进行点对点协作，无需 Vulos OS、无需 Pier、无需中继，也无需账户*——否则只会被使用虚假 fabric 的选择器单元测试所覆盖。

```bash
npm run test:e2e:p2p
```

有两个文件，二者的区别很重要：

**`builtin-rendezvous-p2p.e2e.js` — 默认路径。无法跳过。**
它启动一个独立的 `liwan`，提供其自己的位于 `/api/rendezvous/*` 的发现接口，外加第二个实例（关闭发现功能，用作负面对照）。两个浏览器上下文加载第一个实例。它所需的一切都从本仓库构建而来，因此不存在它会被悄悄跳过的情况——这一点很重要，因为一个可以被跳过的守卫，恰恰会在出问题时缺席。

它断言：独立运行的 Liwan 不提供 `/api/peering/*`，但会宣告 `builtin_rendezvous_prefix`；该接口通过真实 HTTP 拒绝未签名的写入，并且*不存储任何内容*；两个浏览器都能与该源通过协议通信；**服务器自身的在线状态**知道每个浏览器为 announce 所签名的 Ed25519 密钥（这是客户端无法伪造的软状态）；邀请片段中的房间密钥从未出现在任何请求体中，输入的文本也同样没有出现——因此服务器所转发的是密文，而不是内容；编辑在**双向**都能收敛（CRDT 收敛，而不是后写者胜出）；以及负面对照——关闭发现功能且没有中继时，编辑器仍然可以工作，不会说任何发现协议，并如实显示“离线”。

**`rendezvous-p2p.e2e.js` — 可选的外部中继场景。** 两个关闭了内置接口的独立 `liwan` 服务器，都指向一个真实的 `vulos-relayd`，因此“我们的任何东西都不在发现路径中”这一前提完全成立。它还通过头部检查，并从真实 Chromium 页面（位于 Liwan 源上）抓取中继，来固定中继的 CORS 契约（`Allow-Origin: *`、预检成功、无 `Allow-Credentials`）——因为只有浏览器才会执行 CORS——此外还测试了离线分歧在重新连接时以并集方式合并。

该文件在未设置 `VULOS_RELAYD_BIN` 指向预构建的 relayd 时会**跳过**，并将其作为原因打印出来。它刻意**不在测试时获取任何东西**：它过去会 `git clone` 一个同级的中继仓库，这导致该仓库改名时任务失败——原因与被测代码无关，而它本应守护的主张却未被检查。

| 要求 | 说明 |
|-------------|-------|
| Go 工具链 | 在 `vite build` 之后构建 Liwan 二进制文件（`go build`），因为该二进制文件会嵌入 `dist/` |
| `VULOS_RELAYD_BIN` | 可选，仅用于外部中继文件。绝不从同级目录推断；不会从其他仓库克隆或构建任何东西。 |
| Chromium 参数 | `playwright.p2p.config.js` 设置了 `--disable-features=WebRtcHideLocalIpsWithMdns`，使两个回环上下文能够相互看到对方的主机候选地址。这只影响候选地址的可见性——不改变协议、信令路径或加密。 |

在两个文件中，承载编辑的传输方式都被断言为*直连的 host/host WebRTC 对*或*内容盲中继电路*之一，并且运行日志会记录具体是哪一种——而不是在无法完成 ICE 的沙箱中假装是“直连”，也不是两者都不接受而放过一个损坏的传输。

CI 还会在运行之后断言默认路径的测试是**按名称被收集到的**，因为 `playwright test` 在所有测试都被跳过时仍会以 0 退出：如果套件使自己跳过，其表现将与成功完全相同，这种回归若不加检测就会被误判为成功。

### 模拟的 E2E 规范（第 2 层）：

| 文件 | 覆盖内容 |
|------|--------|
| `docs.e2e.js` | 打开文档，输入顺序，粗体，**wave-19 字号**，大纲，查找，字数统计，导出菜单 |
| `collab.e2e.js` | 版本恢复（owner ✓ / **wave-14** viewer ✗ 403），添加评论 + 解决评论 |
| `p2p.e2e.js` | **wave-25** 分享对话框生成读写 + 只读链接；只读片段在导航后保持有效 |
| `sheets-slides.e2e.js` | Sheets：打开 + 输入单元格类型 + 在线状态；Slides：打开 + 添加幻灯片 + 演讲者 + 在线状态 |

## 覆盖边界（什么在哪里测试，以及为什么）

- **Sheets 表格交互**（点击单元格、公式栏）仅在 Playwright 中测试：`@fortune-sheet` 需要真实的 `<canvas>`，并且在 jsdom 下会挂起。单元格/模型逻辑已在 vitest 中进行单元测试。
- **P2P 收敛 / 只读*强制执行* / 加密封装**是通过注入的进程内 fabric 进行无头证明的（`src/lib/crdt/__tests__/yP2PSession.test.js` 与 `p2pShare.integration.test.jsx`，二者都针对实时的 `YP2PCollabSession`）。浏览器 E2E 覆盖的是*分享方 UI* 与邀请链接格式；若要在浏览器中完整强制执行只读，则需要一个实时中继。
- **跨引擎拒绝**（`src/lib/crdt/__tests__/gridEngineHandshake.test.js`）刻意作为单元测试实现，使用共享的进程内总线，而不是浏览器测试，因为它所固定的场景——同一房间中两个使用应用*不同构建版本*的对等方——是单个 Playwright 构建无法构造的。它在同一总线上运行一个真实的 `GridSession` 和一个真实的 `SubstrateGridSession`，并断言二者都会停止复制。它还直接针对 CRDT 内部记录了旧行为（一个 substrate 操作到达 `grid.js` 时会在 `op.key.r` 上抛出异常；一个 `grid.js` 操作到达 substrate 时会被丢弃并返回 `false`），因此该回归是测试套件中的一个事实，而不是注释中的一句主张。

## 仓库完整性门禁（Go `go test ./...`，根包）

这些不是前端测试，但它们与 Go 后端在同一个 CI 任务中运行，并且会导致构建失败，因此也应记录在本页中。

| 测试 | 失败条件 |
|------|-----------|
| `docs_mirror_test.go` → `TestSiteDocsMirrorIsInSync` | `docs/` 下的某个页面（或 `CHANGELOG.md` / `ROADMAP.md`）与其 `site/docs/` 镜像不再逐字节一致。该镜像没有生成器；此测试即为其替代。它此前已经出现过漂移——已发布的更新日志落后了 26 行。 |
| `docs_mirror_test.go` → `TestSiteDocsPageListIsMirrored` | `site/docs.html` 发布了镜像表未覆盖的页面，因此新的站点页面不能在未被察觉的情况下开始漂移。 |
| `docs_links_test.go` → `TestMarkdownRelativeLinksResolve` | `README.md`、`docs/` 或 `third_party/*/VENDOR.md` 中的任何相对 Markdown 链接指向一个不存在的文件。它曾在 README 首页捕获到三个失效链接。`site/docs/` 被排除在外：其链接在渲染时由 `site/docs.html` 重写，因此将其作为文件路径解析是错误的模型。 |

这两个文件不仅断言结果，还断言**已完成的最少工作量**（遍历的文件数、检查的链接数、比较的配对数），因此一个失效的遍历或一个不再匹配的正则表达式会大声失败，而不是空洞地通过。

## Substrate 引擎溯源（Vitest）

共享的 CRDT 引擎过去是一份位于 `third_party/dmtap-sync-wasm/` 下的 vendored 副本。现在它是已发布的 npm 包 `@vul-os/kotva-sync`，固定到一个精确版本，而 `src/lib/crdt/__tests__/substratePackageProvenance.test.js` 分两层对其进行守护：

* **压缩包层面**——`package-lock.json` 记录了 npm 所获取的精确制品的 sha512 SRI，测试会固定该字符串，因此依赖项不能在未经有意更新常量的情况下切换到另一个已发布的压缩包。如果任何依赖项以本地 `file:`/`link:` 路径的形式重新出现（npm 对此不记录任何完整性信息），测试也会失败。
* **已安装的字节层面**——lockfile 哈希覆盖的是压缩包，而压缩包解压后，该哈希就不再起作用，因此测试还会重新计算 `node_modules/@vul-os/kotva-sync` 中每个文件的 SHA-256 和大小，在两个方向上断言所记录的文件集合与已安装的文件集合一致，并断言覆盖计数，使得缩减的清单不能通过检查更少内容而蒙混过关。

它还断言编译后的模块仍然只声明了一个宿主导入，即由 `src/lib/crdt/kotvaSync.js` 提供的那个导入；否则，上游的这一改动会在运行时变成一个裸的 `LinkError`。

**它不能被跳过。** 这里没有需要检测的工具链，也没有需要访问的服务；如果未安装该包，每次读取都会抛出异常，测试套件会失败——这才是正确的结果，因为未安装引擎就意味着 `substrateGrid.js` 也无法加载。

设立这一门禁，是因为 vendored 副本曾悄无声息地落后于上游（一个 395,912 字节的 `.wasm`，而上游构建为 400,930 字节），却没有任何东西报错。上游在 `bindings/go/embed.go` 中记录了同类事件：一个陈旧的已提交模块导致每个 Rust 侧 String 容量超出其长度的响应都让分配器中止。切勿为了让此测试通过而编辑摘要——应从全新安装中重新记录。

## 分享链接令牌存储（Go）

分享链接令牌仅以 SHA-256 哈希的形式存储。四个测试套件守住了这一底线，并且每个都会在明文重新出现时失败：

| 测试 | 失败条件 |
|------|-----------|
| `backend/storage/local_sharelinks_hash_test.go` | 文件后端将令牌写入记录或文件名中；预哈希的数据目录未被转换；转换后的链接无法再解析 |
| `backend/storage/postgres_sharelinks_test.go` | Postgres 后端将令牌写入 `share_links.token`，或修复前旧行的回填未运行。**需要 `VULOS_TEST_POSTGRES_DSN`**；如果未设置则会跳过，并给出一条消息，指明具体哪些内容未被验证；CI 的 `go-postgres` 任务始终会设置它 |
| `backend/storage/backend_contract_test.go` | 任一后端的读取路径返回令牌，或接受一个没有令牌的链接 |
| `backend/handlers/sharelink_token_once_test.go` | `GET /api/files/:id/share-links` 输出 `token` 键（即使是空值），或存储的哈希可以作为凭据用于匿名查看路由 |
