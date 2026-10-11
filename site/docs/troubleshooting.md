# Liwan 议事厅 — 故障排除

按“症状 → 原因 → 解决方法”的形式，整理用户和管理员实际会遇到的问题：文档无法同步、协作对等节点始终无法连接、编辑内容似乎丢失、导入/导出失败。请先阅读[日志位置](#1-日志位置)一节 — 下面几乎每一项诊断都依赖于一行服务器日志或一条浏览器控制台消息。本文中引用的端点、日志行和限制值均为本仓库中的真实内容。

---

## 1. 日志位置

**服务器** — 所有日志都输出到 **stdout/stderr**（Go `log` + Gin 请求日志）。没有日志文件。

| 部署方式 | 命令 |
|------------|---------|
| Docker | `docker logs -f liwan` |
| systemd | `journalctl -u <your-unit> -f` |
| Fly.io | `fly logs -c fly.toml` |
| 前台运行二进制文件 | 已输出在你的终端上 |

值得在启动日志中搜索的行 — 它们会说明每一项模式决策：

```
liwan <version> starting
Config error: ... — using defaults          ← config.yaml missing/unreadable
[seam] integration mode: standalone|cloud
[sso] session introspection enabled|disabled
[cors] explicit origin allowlist ... | no LIWAN_CORS_ORIGINS set ...
[rate-limit] write/collab endpoints: token-bucket cap=30 rate=10/s per IP
[v1] API-key introspection enabled | API-key path disabled
[local-files] auth enabled (multi-tenant): local-files ... disabled
Liwan running → http://localhost:8080
```

**浏览器** — 打开开发者工具 → Console。协作失败会记录在这里（例如 `[p2p] join from link failed: …`）。开发者工具 → Network 会显示确切失败的请求及其状态码。

**健康检查/版本** — `GET /healthz` → `{"status":"ok","version":"…"}`，`GET /version`，Prometheus 指标位于 `GET /metrics`。

**安全审计** — 设置 → 管理 → *审计日志*（或 `data/audit.db`）：记录每一次共享、角色变更、邀请和注册。签署信封的事件位于 `data/audit/<envelopeID>/` 下。

---

## 2. 服务器无法启动 / 无法访问

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 启动时报错 `auth is enabled but no JWT signing secret is configured` | 设置了 `auth.enabled: true` 但没有提供密钥 | `export LIWAN_JWT_SECRET="$(openssl rand -hex 32)"`（或仅在本地开发时使用 `LIWAN_DEV=1`） |
| 启动时报错 `Storage init failed` | `DATABASE_URL` 错误 / Postgres 无法访问 / `data_dir` 不可写 | 检查 URL 和数据库连通性；确保进程能够创建 `./data`（在 Docker 中可写目录为 `/srv/data`、`/srv/uploads`） |
| 服务正常启动，但配置似乎未生效 | 日志显示 `Config error: … — using defaults` | 服务器从**工作目录**读取 `config.yaml`。请在包含该文件的目录中运行 |
| Docker 构建时无法解析 npm 依赖 | 构建上下文中存在过期的 `node_modules`/锁文件，或 `file:third_party/*` 的 vendored 依赖与 `package-lock.json` 不同步 | 在仓库根目录以干净的上下文构建：`docker build -t ghcr.io/greenchennai/liwan:latest .`；若问题依旧，删除 `node_modules` 后重新执行 `npm install` 再构建 |
| 容器健康检查失败 | 应用未在 8080 端口监听，或反复崩溃重启 | 查看 `docker logs`；确认 `server.addr` 和端口映射；在容器内部访问 `/healthz` |

---

## 3. 文档无法同步（点对点）

协作是**点对点的 — 不存在中心化的文档服务器**可供检查。编辑内容通过端到端加密的 WebRTC 房间在浏览器之间传输；服务器端唯一的部分是对内容不可见的对等节点**发现**，默认由本二进制自身在 `/api/rendezvous/*` 上提供（或由主机的 `/api/peering/*` 提供，或由已配置的中继提供）。在 Network 标签页中，你应当看到该发现流量以及一条 WebRTC 连接 — 而**绝不**应出现 `/v1/documents/*/collab/*` 请求（这类请求根本不存在）。

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 编辑器显示“离线”，没有其他人出现 | 此部署**完全没有提供发现服务**：内置接口已禁用（`collab.builtin_rendezvous: false`），没有主机端的 `/api/peering/*`，也没有配置 `rendezvous_url` | 检查 `GET /api/reachability` — 如果 `builtin_rendezvous_prefix` 和 `rendezvous_url` 都为空，即为原因。删除 `builtin_rendezvous: false`（默认即为开启），**或者**将 Liwan 部署在 Vulos OS / Pier 主机之后，**或者**将 `collab.rendezvous_url` 设置为自托管的 `vulos-relayd`（参见 [CONFIGURATION.md](CONFIGURATION.md)）。无论如何，你的编辑内容仍会自动保存到存储中 |
| 编辑器显示“离线”，但 `/api/reachability` 返回 `builtin_rendezvous_prefix: "/api/rendezvous"` | Liwan 前面的反向代理未转发 `/api/rendezvous/*`，或对其进行了限速 | `curl -i https://office.example.org/api/rendezvous/healthz` 必须返回 `{"ok":true,…}`。这是普通的同源 JSON，通过 POST/GET 传输 — 不需要 WebSocket 升级，因此此处返回 404/502 说明问题出在代理上，而非 Liwan |
| 对 `/api/rendezvous/*` 的发现请求返回 **409** | 浏览器时钟与服务器时钟相差超过 5 分钟，因此每个签名信封都被视为过期（这正是重放防御在起作用） | 修复任一端的时钟同步（NTP）。响应正文会明确说明这一点 |
| 对 `/api/rendezvous/*` 的发现请求返回 **429** | 每 IP 速率限制 — 通常只有在许多对等节点位于同一 NAT 之后，或客户端陷入重连循环时才会出现 | 首先检查页面是否存在重新加载循环。整个办公室位于同一地址之后，完全在限制范围之内（240 个令牌突发，持续 40/s） |
| 设置了 `rendezvous_url`，但开发者工具显示发现请求因 **CORS** 错误失败 | 浏览器会**直接**（跨源）访问已配置的 relayd。其 rendezvous 角色必须发送 CORS 头 — 旧版 relayd，或其前面剥离了这些头的反向代理，都会导致所有用户的发现失败 | 直接检查：`curl -i -H "Origin: https://office.example.org" https://relay.example.org/rendezvous/ice` 必须返回 `Access-Control-Allow-Origin: *`（并且**不得**返回 `Access-Control-Allow-Credentials`）。升级 relayd，或停止代理剥离这些头 |
| 设置了 `rendezvous_url`，但浏览器以**混合内容**为由拦截了请求 | `https` 的 Liwan 页面无法调用 `http://` 的中继 | 为中继配置 TLS，并将 `collab.rendezvous_url` 设置为其 `https://` URL。`http` 中继只适用于 `http`（例如局域网/开发环境）的 Liwan |
| 邀请链接可以打开，但没有人连接上 | 发现服务不可达（代理丢弃了 `/api/peering/stream` WebSocket），**或者**双方都位于无法穿透的严格 NAT 之后且没有 TURN | 转发发现 WS 的 `Upgrade`/`Connection` 头，并保持较长的读取超时；确保主机的 ICE 配置包含可用的 STUN，并在严格 NAT 情况下包含 TURN 服务器（参见 [ADMIN-GUIDE.md](ADMIN-GUIDE.md) §6） |
| 两个人编辑同一文档，但彼此看不到对方 | 他们打开的是**不同**的房间 — 每个 `#vp2p=` 链接都对应独立的房间/密钥 | 所有人必须打开**同一个**邀请链接，且片段（`#vp2p=…` 部分）必须完整。转发链接文本（而非重新分享）是可以的 |
| 只读对等节点的编辑从未生效 | 这是预期行为：只读链接持有解密密钥，但**不持有** RW 权威 MAC，因此可读写的对等节点会在密码学层面拒绝其写入 | 如果该人员应当有编辑权限，请分享**可读写**链接 |
| 打开文档本身时出现 `404` | 你失去了访问权限、文档已被删除，或你从未被授予权限 — 无访问权限时故意返回 `404`（不泄露文件是否存在）。（这是账户文件访问，不是协作。） | 向所有者确认共享情况（设置 → 管理 → 审计日志会显示授予/撤销记录） |
| 保存时返回 `429` | 每 IP 写入令牌桶（突发 30，每秒补充 10）— 通常是许多用户位于同一 NAT/代理 IP 之后，或是脚本所致 | 退避重试；将真实客户端 IP 置于限流器之前；可信的内部工具可以使用 `--no-rate-limit-writes` 运行服务器 |

---

## 4. 协作对等节点无法连接（P2P / 邀请链接）

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 在线状态标识显示离线/本地；对等节点数量始终为 0 | 完全无法访问任何发现传输层 | `GET /api/reachability`：如果 `builtin_rendezvous_prefix` 为 `/api/rendezvous`，说明该接口已开启 — 检查代理是否正确转发。如果为空，则有人设置了 `collab.builtin_rendezvous: false`；默认为开启。`/api/peering/stream` 返回 404 在独立二进制上是正常且预期的（该路径由 Vulos OS / Pier 主机提供） |
| 邀请链接可以打开文档，但未启动 P2P 会话 | `#vp2p=…` **片段丢失** — 聊天应用、重定向或链接“净化”工具通常会去掉 URL 片段 | 从分享弹窗中重新复制链接（复制按钮），并通过能保留 `#…` 的渠道发送；验证收到的 URL 仍包含 `#vp2p=` |
| 控制台：`[p2p] join from link failed: …` | 邀请载荷格式错误/被篡改/被截断 — 按设计加入会**失败关闭** | 向分享者索取新链接（轮换会生成新链接） |
| 昨天链接还能用，今天失效 | 分享者**轮换**了房间 — 轮换会撤销此前所有链接 | 索取新链接 |
| 被邀请的人可以查看但无法编辑 | 他们拿到的是**只读**链接（`cap=ro`）— 只读对等节点在密码学层面无法产生具有权威性的编辑 | 发送**可读写**链接 |
| 代理后方 WebSocket 升级失败 | 代理未在 `/api/peering/stream` 上转发 `Upgrade`/`Connection` 头 | 为该路径启用 WebSocket 代理（nginx：`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`） |
| 对等节点能够连接，但只能通过中继（速度较慢） | WebRTC 被阻断（严格 NAT/防火墙/UDP 被过滤）— 架构会自动回退到中继 | 可以接受；若要获得直连路径，请根据中继的 ICE 配置（`GET /api/peering/ice`）允许 UDP/STUN |

---

## 5. 编辑内容丢失

通常可以恢复 — 请按以下顺序检查：

1. **是否关闭了草稿恢复提示？** 每次保存前，编辑器都会写入一份 IndexedDB 草稿（`liwan-drafts` 数据库）；崩溃或离线后重新加载时，它会提示*恢复待处理草稿*。如果你重新打开文档时出现该提示，请接受它。
2. **版本历史。** 每次保存都会生成版本快照。打开历史面板 → *比较*（文档模块的按行差异）→ **恢复**。命名快照/标签可以帮助你快速找到正确的版本。
3. **保存冲突（409）。** 如果文档在没有实时协作的情况下于两台设备上被编辑，第二次保存会收到 `409 revision conflict`；存储会与服务器副本进行协调并重试。如果重试覆盖了你想保留的内容，冲突前的内容仍保存在版本历史中。
4. **你是查看者。** 操作被静默拒绝（`403`）意味着你的“编辑”从未离开你的标签页。名单中会显示你，但没有任何内容被持久化。请申请编辑者角色，然后重新应用你的修改（在刷新页面之前，你的本地文本仍显示在屏幕上 — 请先将其复制出来）。
5. **端到端房间，独自关闭。** 在邀请链接会话中，*服务器*从未存储房间的实时操作；你的浏览器保存了 `localStorage` 快照（`vulos_p2p_snap_*`），而你自己的保存则通过常规账户自动保存完成。在同一浏览器中重新打开同一文档即可恢复本地状态。
6. **撤销的困惑。** `Mod+Z` 撤销的是*你自己*的操作，而不是协作者的操作 — “我的撤销没有删除他们的段落”是正确的行为。

预防措施：留意保存状态指示器（未保存/保存中/已保存/错误）。*错误*状态意味着网络写入失败 — 草稿在本地是安全的，但在状态变为*已保存*之前，请勿关闭浏览器。

---

## 6. 导入失败

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| “暂不支持旧版二进制 .doc 文件 — 请另存为 .docx …” | `.doc`/`.xls`/`.ppt`（2007 年之前的二进制格式）被有意排除在外 | 另存为 `.docx`/`.xlsx`/`.pptx` 或 ODF（使用任意办公套件即可） |
| “无法打开 .xyz 文件” | 扩展名不在支持范围内（`md txt docx rtf html htm odt / xlsx xls csv tsv ods / pptx odp / pdf`） | 转换为支持的格式 |
| 因大小/压缩包边界而拒绝导入 | 防护机制，防止超大或“zip 炸弹”式文件（`importBounds`） | 拆分文件或减少嵌入的媒体 |
| `.docx` 导入后图片缺失 | 导入从不获取远程图片 — 只会保留*嵌入*的图片（以内联数据形式） | 这是预期行为：请手动重新插入引用外部的图片 |
| HTML 导入后内容似乎被剥离 | 净化器移除了脚本/iframe/不安全样式/非位图图片 — 按设计采用失败关闭策略 | 对于不安全的标记，这是预期行为；普通格式会被保留 |

## 7. 导出失败

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| PDF 导出“没有任何反应”（文档/幻灯片） | PDF 导出基于打印（`Mod+P` → 打印对话框）；弹窗拦截器、打印拦截器或 kiosk 浏览器可能会阻止它 | 允许打印对话框；使用系统的“另存为 PDF”打印机 |
| 将 `/v1` 幻灯片导出为 `pptx` 时缺少编辑器中定位的对象 | 服务器渲染的是已存储的演示文稿模型（背景、标题、正文）；编辑器自身的 PPTX 导出（pptxgenjs）还包含在客户端定位的对象 | 这是预期行为；需要定位版式时请使用编辑器的 PPTX 导出按钮 |
| 导出端点返回 `400 unsupported format` | 格式/类型不匹配 — 服务器支持 `doc→pdf,docx`、`sheet→xlsx`、`slide→pdf,pptx` | 使用受支持的组合（文档的 ODT/MD/HTML 以及表格的 CSV/ODS 为客户端导出） |
| 导出的 CSV/XLSX 单元格在 `=`/`+`/`-`/`@` 前显示前导 `'` | 公式注入中和 — 为保护下游电子表格应用而有意设计 | 这是预期行为；如果你确实需要在目标文件中使用实时公式，请手动删除 |
| `pdf generation failed` / `docx generation failed`（500） | 服务器端渲染器遇到格式错误的内容 | 查看服务器日志中的消息；尝试客户端导出路径；附上文档结构后报告问题 |
| 图片上传失败并提示类型错误 | 仅接受经内容检测的**位图**图片（拒绝 SVG 和 MIME 伪造的文件）；每次上传上限 10 MB | 将 SVG 转换为 PNG；压缩超过 10 MB 的图片 |

---

## 8. 升级后界面过时或损坏

Liwan 是带有 Service Worker（`public/sw.js`）的 PWA：应用外壳采用**缓存优先**策略并在后台重新验证，`/api/**` 和 `/collab/**` 从不缓存。

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 服务器升级后仍显示旧界面 | 先提供了缓存的外壳（`/`），后台再进行重新验证 | 再重新加载一次（新的 Worker 会调用 `skipWaiting` + `clients.claim`，因此第二次加载即为最新）；或强制刷新 |
| 界面新旧混杂，JS 报错提示缺少 chunk | 缓存的 `index.html` 引用了新部署不再提供的带哈希 chunk | 强制刷新（Shift + 重新加载）；最坏情况下，在开发者工具 → Application → Service Workers 中注销并清除该站点的存储 |
| 应用“可离线使用”但不显示任何文档 | 这是正确行为 — 外壳被缓存，服务器状态则刻意不缓存 | 恢复网络连接；未同步的本地工作由草稿保护（参见 §5） |

请使用 `GET /version` 确认服务器实际运行的版本，并与界面报告的版本进行比较。

---

## 9. 在线状态与成员列表异常

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 协作者关闭标签页后，其头像仍然残留 | 崩溃或网络中断跳过了正常的“离开”信标；成员条目会在约 15 秒的 TTL 后过期 | 等待约 15 秒 — 它会自动清除 |
| 同一人只出现一次，但其同时通过 P2P 和服务器连接 | 两种传输方式的成员列表会按账户 ID 合并并去重 | 这是预期行为 |
| “查看者”显示实时光标 | 查看者合法地出现在在线状态中并显示光标；但其内容编辑仍会被拒绝（`403`） | 这是预期行为 — 在线状态不等于写入权限 |
| 成员列表中没有任何人，但同步正常 | 在线状态端点（`POST /v1/documents/:id/collab/presence`）被阻止，或与操作分开进行了速率限制 | 检查 Network 标签页中该 POST 请求的状态 |

---

## 10. 签署与信封

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 签署人链接（`/sign/<token>`）无法使用 | 信封已取消、签署人已完成/拒签，或令牌已过期（签署令牌与共享链接一样有生存期限制） | 检查信封状态（`/envelopes` 面板或 `GET /api/sign/:id/status`）；重新发送 |
| 在顺序签署的信封中，签署人暂时无法操作 | 顺序路由 — 前面的签署人必须先完成 | 查看状态页面；如果顺序无关紧要，可以使用并行路由 |
| 需要证明封存的 PDF 是真实的 | — | 公开的验证页面 `/verify`（或 `POST /api/sign/verify`）；服务器的签名公钥位于 `GET /api/sign/pubkey`；审计清单可通过 `GET /api/sign/:id/manifest` 下载 |
| 恢复后已完成信封的文件丢失 | 封存的 PDF 位于 `data/sealed/`，信封审计位于 `data/audit/<envelopeID>/` | 确保这些目录已包含在备份集中（参见 [ADMIN-GUIDE.md](ADMIN-GUIDE.md) §7） |

---

## 11. 接入控制平面的部署（CP 接口）

仅当设置了 `VULOS_CP_BASE_URL` / `IDENTITY_URL` 时相关 — 若两者均未设置，则不会运行以下任何代码。

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 写入/上传/邀请时返回 `402` | 权益/配额检查：超出存储配额、席位已用完，或账户被暂停（权益来自控制平面） | 在控制平面一侧处理；独立安装永远不会收到 402（本地权益不受限制） |
| 使用 `vk_` 密钥访问 `/v1` 时返回 `503 API key validation unavailable` | 密钥内省期间控制平面不可达 — 按设计**失败关闭** | 恢复控制平面的连通性；内省结果会按密钥缓存约 60 秒，因此短暂故障大多可以平稳度过 |
| 所有 SSO 登录均返回 `401` | `IDENTITY_URL` 内省**失败关闭**（提供方宕机，或 `VULOS_CP_TOKEN` 错误） | 检查 `[sso]` 启动日志行以及提供方的 `/api/session/introspect`；原生 JWT 登录（若已启用）仍可正常使用 |
| 控制平面故障后功能消失 | 权益获取在临时故障时**失败开放**（fail open）— 因此通常问题不在控制平面 | 检查 `[seam]` 日志行；确认你所处的模式与你预期的一致 |

---

## 12. 嵌入与 CORS

在嵌入 `liwan` 库面板，或从其他源调用 API 时：

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 浏览器控制台出现 CORS 错误，请求从未到达处理程序 | 来源不在 `LIWAN_CORS_ORIGINS` 中 | 设置确切的来源（逗号分隔）；启动日志会回显允许列表 |
| 请求成功，但跨源时 Cookie/会话被忽略 | 未设置 `LIWAN_CORS_ORIGINS` 时，允许所有来源但**不携带凭据** | 设置允许列表 — 携带凭据的 CORS 请求必须明确指定来源 |
| 嵌入的编辑器可以加载，但协作端点返回 401 | 嵌入页面的会话对 Liwan 无效 | 从宿主应用使用 `Authorization: Bearer`（会话 JWT 或 `vk_` 密钥），或通过 `IDENTITY_URL` 使用 SSO |

---

## 13. 数据库与迁移问题（Postgres）

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 启动时报错 `Storage init failed` 并附带 pg 错误 | `DATABASE_URL`/`VULOS_DATABASE_URL` 错误、TLS 模式错误或权限不足 | 验证 URL（Neon 需要 `sslmode=require`）；该角色需要有创建/使用 `office` schema 的权限 |
| 指向新数据库后表缺失 | 首次启动会自动创建表，但权限受限的角色可能无法创建 | 使用权限足够的 URL 运行 `./liwan migrate up`；`migrate status` 会列出已存在的表 |
| 两个产品在同一数据库中发生冲突 | 按设计不应发生 — Liwan 将自身限定在 `office` schema 内 | 确认是其他产品出现了异常；Liwan 的表全部位于 `office.*` 下 |
| 从本地切换到 Postgres 后文档“消失” | 存储后端之间不会自动迁移内容 | 指回原来的 `data_dir` 即可恢复；或导出/导入文档，或只使用一种后端 |

---

## 14. 共享与登录异常

| 症状 | 原因 | 解决方法 |
|---------|-------|-----|
| 共享链接提示需要密码，但接收者从未设置过密码 | 这是正常行为 — 链接所有者设置了密码；在输入密码之前，名称和内容均会被隐藏 | 所有者通过其他渠道分享密码，或创建一个不带密码的新链接 |
| 共享链接已失效 | 已过期（有效期最长为一年）或已撤销 | 创建新链接 |
| 某用户的所有请求都返回 `404` | ACL 拒绝读取 — 无访问权限时故意返回 `404` | 所有者重新共享；检查审计日志中是否有撤销记录 |
| 登录被锁定 | 超出 `auth.max_attempts` → 锁定 `lockout_minutes` | 等待锁定时间结束（默认 15 分钟）；管理员可以在日志中核实尝试记录 |
| 启用认证后，“从服务器文件夹打开”功能消失 | 多用户模式下 `/api/local-files*` 路由被禁用（防止跨租户暴露）；日志中会说明这一点 | 这是预期行为；请通过常规的“打开”对话框上传文件 |
| 升级后整个团队突然无法登录（共享密码时代遗留） | 每用户凭据存储为空 | 运行 `./liwan migrate-credential -admin <account>`（可安全地重复运行），然后生成邀请 |

---

## 15. 内置限制（帮助你区分缺陷与防护机制）

以下均已对照代码验证；触发这些限制属于预期行为，而非故障：

| 限制 | 值 | 触发场景 |
|-------|-------|----------------|
| 上传大小 | 每个文件 10 MB，仅限位图（经内容检测） | 插入图片 |
| 写入/协作速率 | 每 IP 令牌桶：突发 30，每秒补充 10（返回 `429`） | 脚本、共享 NAT/代理 IP |
| 登录尝试 | `auth.max_attempts`（默认 5）→ 锁定 `lockout_minutes`（默认 15） | 多次输入错误密码 |
| 会话有效期 | `auth.session_hours`（默认 24）→ 之后返回 `401` | 长时间保持打开的标签页 |
| 共享链接有效期 | 无论请求多长，最长均为 1 年 | “永久”链接 |
| 操作发布批处理 | 每个客户端约 250 ms 合并 | 不是延迟缺陷 — 设计上即为亚秒级 |
| 在线状态心跳 / TTL | 约 8 秒 / 约 15 秒 | 幽灵头像最多残留 15 秒 |
| SSE 重连宽限期 | 约 8 秒后编辑器才会报告降级 | 短于此时长的中断不可见 |
| 本地快照 | 防抖约 3 秒写入 `localStorage` | 瞬间崩溃可能丢失最多 3 秒的*本地快照*（草稿仍会保护已保存的内容） |
| 导入限制 | 对导入文件的大小和压缩包条目数量设有上限 | 类 zip 炸弹或超大文件 |
| 服务器导出格式 | 文档→`pdf`、`docx`；表格→`xlsx`；幻灯片→`pdf`、`pptx` | 通过 API 自动化 |

---

## 16. 快速诊断：我正在使用哪种协作路径？

在开发者工具 → Network 中花30秒即可回答大多数协作相关问题。（协作是点对点的 — 你**永远不应**看到 `/v1/documents/*/collab/*` 请求；不存在文档服务器。）

1. **是否已连接到 `/api/peering/stream` 的 WebSocket？** 说明主机端的对等节点发现已启动。在独立二进制上该路径返回 `404` 是正常的 — 请改为检查 `GET /api/reachability`：`rendezvous_url` 非空，表示发现请求直接发往该自托管的 relayd；`builtin_rendezvous_prefix` 非空（默认），表示本二进制自身在该路径上提供发现服务。只有**两者都为空**时，协作才是仅本地的。
2. **地址栏中是否有 `#vp2p=`？** 说明你处于协作房间中。所有人必须使用**同一个**链接（片段完整）。WebRTC 连接应在发现完成后建立（通过上一步中胜出的任一传输方式）— 文档字节在该连接中传输，而不是通过任何 HTTP 请求。
3. **是否看到任何 `/v1/documents/*/collab/*` 请求？** 那是**回归**问题 — Liwan 没有服务器中转的协作端点。请提交 issue。
4. **以上都不是？** 你处于仅本地模式：自动保存和草稿仍能保护你的工作；请检查认证（`/api/auth/status`）和网络连接。

---

## 17. 仍未解决？提交 issue 前请先收集以下信息

1. `GET /version` 的输出，以及你的部署方式（二进制/Docker/Fly/套件）。
2. 故障发生前后的服务器日志片段（参见 §1 — 包括启动时的模式信息行）。
3. 浏览器控制台，以及 Network 标签页中失败请求的方法/路径/状态码。
4. 该文档是通过账户共享、共享链接，还是 `#vp2p=` 端到端会话访问的 — 这三种路径的失败方式各不相同（参见 [COLLABORATION.md](COLLABORATION.md) §9）。

涉及安全的问题请遵循 [SECURITY.md](../SECURITY.md)，不要公开提交 issue。

---

## 另请参阅

- [USER-GUIDE.md](USER-GUIDE.md) — 文档、表格、幻灯片和签署的日常使用
- [COLLABORATION.md](COLLABORATION.md) — 点对点 CRDT 同步和端到端房间的实际工作原理
- [ADMIN-GUIDE.md](ADMIN-GUIDE.md) — 部署、配置、存储、备份
- [CONFIGURATION.md](CONFIGURATION.md) — 完整的环境变量对照表
- [API.md](API.md) — `/v1` REST API 及其状态码
