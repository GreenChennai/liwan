# Liwan 议事厅 — 配置参考

Liwan 的全部运行时配置由 `config.yaml` 和环境变量驱动。环境变量的优先级高于配置文件。

默认情况下，服务器会在进程的当前工作目录中查找 `config.yaml`。可以使用 `-config`（同样接受 `--config`；Go 的 flag 解析器对两者的处理相同）指定其他路径，例如：

```sh
liwan -config /etc/liwan/config.yaml
```

Liwan 从不因配置问题而拒绝启动 — 这是为了支持零配置的首次运行而有意设计的，但也意味着 `-config` 路径拼写错误时会静默失败：

- **文件缺失**（路径错误、拼写错误）：静默回退到内置默认值 — 不会报错，也不会输出日志。如果某项设置似乎没有生效，请先检查路径（例如 `ls -la <path>`）。
- **文件存在但 YAML 无效**：回退到默认值，并在启动时输出 `Config error: … — using defaults` 日志。

`migrate` 子命令（`liwan migrate up|status`）有其自己的 `-config` 标志，默认行为相同；它与服务器命令使用的是独立的标志集，因此需要将其放在 `migrate` 之后传递：`liwan migrate -config /etc/liwan/config.yaml up`。

---

## config.yaml

```yaml
server:
  addr: ":8080"            # Listen address (default :8080)
  data_dir: "./data"       # Root directory for SQLite stores, JSON file store
  uploads_dir: "./uploads" # Uploaded file staging area

auth:
  enabled: false           # true = require password login; false = open access (local dev)
  password: "changeme"     # Shared password (single-user mode / migration source)
  max_attempts: 5          # Failed logins before lockout
  lockout_minutes: 15      # Lockout duration
  session_hours: 24        # JWT session expiry

storage:
  type: "local"            # "local" (JSON files) or "postgres"
  postgres:                # Only used when type: "postgres"
    host: "localhost"
    port: 5432
    user: "postgres"
    password: ""
    database: "liwan"
    sslmode: "disable"

persistence:
  updatelog: false         # CRDT-native persistence (see below)

collab:
  rendezvous_url: ""       # Self-hosted relayd for OS-free P2P collab (see below)
```

### `persistence.updatelog` — CRDT 更新日志

默认关闭。设置为 `true` 后，Liwan 会开放每个文件的**仅追加 CRDT 更新日志**（`POST`/`GET /api/files/:id/updates`）— 这是取代“单一数据块 + 409 比较并交换”的持久化模型。每个 CRDT 帧都会被保留（不透明的、加密或明文的 Yjs / 表格 / 幻灯片更新），因此两个**离线**编辑的客户端都能收敛，且没有任何内容被丢弃。该功能是**附加性的**：整文档 PUT 仍然可用，前端会双写，因此切换此标志绝不会丢失文档。

**存储后端**会自动跟随 `storage.type`，无需单独设置：

| `storage.type` | 更新日志后端 | 帧的存放位置 |
|----------------|--------------------|-------------------|
| `local`（默认） | 文件系统 `LocalStore` | `<data_dir>/updates/<id>/` |
| `s3` | 文件系统 `LocalStore`（回退） | `<data_dir>/updates/<id>/` |
| `postgres` | `PostgresStore`（与存储连接池共享） | `office.file_updates` + `office.file_update_snapshots` |

Postgres 后端通过事务级的**按文件咨询锁**派生单调递增的每文件序号，并在一个事务中完成快照 upsert 和帧清理。（S3 没有原子的“带单调序号的追加”原语，因此其持久帧日志保存在本地磁盘上；整文档 PUT 仍会将对象副本写入存储桶。）

**配额**：帧追加与整文档 PUT 经过**相同的存储配额检查**，因此无法借助更新日志绕过存储上限（独立/无限制模式下为空操作）。

**压缩**由客户端驱动，服务器只能“提示”。服务器无法将不透明的 CRDT 帧折叠为快照，因此当某文件未压缩的尾部超过 `updatelog.CompactAdviseThreshold`（默认 600）时，追加响应会返回 `compact: true`，客户端随后提交快照。此处没有可调的服务器设置。

只有在使用 `VITE_UPDATE_LOG=on` 构建时，前端才会将编辑镜像到日志中（文档、白板、表格和幻灯片均已接入）；否则服务器路由依然存在，但客户端会继续使用整文档自动保存（若端点不存在，则会干净地自行禁用日志路径）。两者需同时启用。

---

### `VITE_SUBSTRATE_SYNC` — 在共享 substrate 引擎上运行表格

**默认开启。** 这是仅限前端构建的标志；服务器端没有对应设置。

Liwan 的表格网格提供两种可互换的 CRDT 实现：

* **开启（默认）** — `src/lib/crdt/substrateGrid.js`，即按 `substrate/SYNC.md` §4.4 实现的 LWW 寄存器（规范位于 `kotva` 仓库中；这里不做相对链接，因为构建 Liwan 永远不应依赖同级仓库的检出）。其计算由**共享的** KOTVA Sync 引擎完成 — 即已发布的 npm 包 [`@vul-os/kotva-sync`](https://www.npmjs.com/package/@vul-os/kotva-sync)，与 Rust 服务器运行的编译核心完全相同，而不是对同一规范的第二套实现。该包此前以内置副本的形式放在 `third_party/` 下，直到 substrate 发布后才改为普通的固定版本依赖；`src/lib/crdt/__tests__/substratePackageProvenance.test.js` 会固定锁文件中 tarball 的 sha512 以及每个已安装文件的 SHA-256。`src/lib/crdt/kotvaSync.js` 是加载器 — 该包是 wasm-pack 的*打包器*构建产物，其入口点无法在 Vitest 下导入，因此该文件直接实例化 WebAssembly；它复用已发布的包装器和 `.wasm`（逐字节一致），不重新实现任何代数逻辑。
* **`VITE_SUBSTRATE_SYNC=off`** — `src/lib/crdt/grid.js`，即 substrate 出现之前 Liwan 一直使用的手写 LWW 映射。作为部署范围内的选择仍然受支持；但它是同一思想的第二套实现，因此两个副本使用它时能够收敛，是因为这一个实现自洽，而不是因为它们运行的是共享的、经向量固定的代数。

两条路径的存储和传输完全相同：相同的 `OpLogSync` 适配器、相同的服务器更新日志、相同的架构线路类型。只有合并代数不同。

**这在整个部署中必须保持一致。** 两个引擎各自都是收敛的，但并不共享全序：`grid.js` 通过 `(lamport counter, replicaId)` 解决冲突写入，忽略挂钟时间；而 substrate 使用完整的 HLC `(wall, counter, author)`。对于同一单元格的两个并发写入，它们可能选出不同的赢家。因此，构建时标志（而非按用户灰度发布）才能确保每个副本使用同一个引擎。

**当标志无法保证一致时，表格会拒绝协作，而不是假装可以。** 构建时标志只能保证同一部署的同一构建使用同一引擎，这与同一*房间*中使用同一引擎并不是一回事。以下三种常见情况会破坏一致性：一个在你切换标志之前加载、仍处于打开状态的标签页；CommonJS 库构建（它永远无法加载 `.wasm`，因此总是运行 `grid.js`，见下文）；以及两个部署通过同一个邀请链接相遇。在混合房间中实际发生的情况比“赢家不同”更糟：两个引擎共享架构的消息*类型*，但操作*载荷*不同，因此**什么都没有传过去** — 每个操作在另一端都会被丢弃或抛出异常 — 而两边的编辑器依然显示正常的对等节点列表和绿色的“Live”。

现在，表格会话会在加入时通过 `grid_hello` 公告其所用引擎；对于无法公告的旧版对等节点，则根据其发送的任何操作的*形态*推断其引擎。发现不匹配时，会话将在双向停止复制，并且在该会话期间永久停止：不发送任何操作，不应用任何操作，也不向持久更新日志追加任何内容。状态标识会变为红色的 **“未同步”**，横幅会告知用户其工作仍在保存，并提示所有人使用同一构建后重新加载。本地编辑和整文档自动保存不受影响。参见 `src/lib/crdt/gridEngine.js` 中的推理过程，以及 `src/lib/crdt/__tests__/gridEngineHandshake.test.js` 中的证明。

**成本。** 该引擎为 WASM，通过动态导入加载，因此首次打开电子表格时需要获取约 23 kB 的 JS（gzip 后 5.7 kB）以及一个 402.0 kB 的 WebAssembly 模块（gzip 后 159.6 kB），仅需一次。若构建时关闭该标志，则**不会**额外下载任何内容。

**如果该加载失败**，编辑器*不会*悄悄切换代数。对于可以进行复制的会话 — 已挂载协作架构，或更新日志已开启 — 它会在该会话中保持**仅本地**：网格仍可打开、编辑，并自动保存整个文档，但不发送也不应用任何 CRDT 操作。在这种情况下回退到 `grid.js` 可能会与加载成功的对等节点产生永久且不可见的分歧（参见上文关于全序的说明），这比协作实时性可见地丢失更糟。只有在无法进行任何复制时（没有对等节点，也没有更新日志），才会使用 `grid.js`。

加载必然失败的一种已知情况是库构建的 **CommonJS** 产物。打包器会在该处将 `import.meta` 替换为 `{}`，因此加载器无法定位 `.wasm`。CJS 使用者只能获得单用户网格；如需协作，请使用 ESM 构建。

文档和白板**不受影响**：它们使用 Yjs 处理富文本，而 substrate 的代数并不对其建模。幻灯片同样不受影响 — 具体说明 substrate 的可移动树对其的复现程度以及仍有哪些差距，请参见 `src/lib/crdt/__tests__/substrateTree.mapping.test.js`。

---

### `collab.builtin_rendezvous` — 由本二进制提供的对等发现（默认：**开启**）

Liwan 的后端从不中转实时文档内容 — 文档/白板的邀请链接路径，以及表格/幻灯片的在线状态层，都通过 Liwan 自有的第一方 `FabricClient`（`src/lib/collab/webrtc/fabric.js`；参见 [COLLABORATION.md](COLLABORATION.md) §3）在对等节点之间直接通信。但 WebRTC 无法在**没有帮助**的情况下将两个浏览器互相引荐：必须有某种机制来传递最初的 offer/answer/ICE 帧。

`collab.builtin_rendezvous` 使本二进制成为这一角色。该功能默认开启，它在自身源上的 `/api/rendezvous/*` 提供签名的、对内容不可见的 announce/resolve/signal/mailbox 协议（`backend/rendezvous`），因此**单台机器上的一个 `liwan` 就足以满足两个人的需求** — 无需 Vulos OS、无需 Pier、无需中继、无需账户。

在该功能出现之前，发现必须来自其他产品，而没有可用的此类产品时，独立二进制就根本无法实现点对点通信。

```yaml
collab:
  builtin_rendezvous: true    # default; set false to serve no discovery yourself
```

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `VULOS_BUILTIN_RENDEZVOUS` / `LIWAN_BUILTIN_RENDEZVOUS` | 覆盖 `collab.builtin_rendezvous`。`1/true/on/yes` 或 `0/false/off/no`。 | `true` |

**你的机器能看到什么，直接说明。** 发现元数据：哪些 Ed25519 密钥存在、哪个密钥向哪个密钥发送了字节、大小、时间。不包括内容 — 每个载荷都在房间密钥下封装，而房间密钥位于邀请链接的 URL 片段中，从不随 HTTP 请求发送，实时编辑也完全不经过该通道。没有任何内容写入磁盘：它是内存中的软状态，TTL 为数分钟，重启后两个客户端只需重新公告即可。

**可以安全地对外暴露**，这一点很重要，因为云节点正是如此。每次写入都经过 Ed25519 签名，签名基于带域分隔、带长度前缀的规范消息，并携带新鲜的 nonce 和时间戳（拒绝重放和过期信封）；所有维度 — 载荷大小、队列深度、密钥数量、TTL — 在存储前都有上限。该接口有每 IP 速率限制。失败均为拒绝：签名错误返回 403，重放或过期信封返回 409，超出上限的载荷返回 413，且在这些情况下均不会存储任何内容。该接口按设计是匿名的（邀请链接协作无需账户），并且**仅**通过请求体签名进行认证，从不依赖 Cookie。

**关闭该功能**是受支持的，并会优雅降级：会话会回退到 `collab.rendezvous_url`（若已设置），否则降级为仅本地模式，并由界面明确告知。它绝不会降级为一个损坏的编辑器。

自行验证：

```sh
curl -s  http://localhost:8080/api/reachability      # builtin_rendezvous_prefix: "/api/rendezvous"
curl -si http://localhost:8080/api/rendezvous/healthz # {"ok":true,"service":"rendezvous"}
```

`npm run test:e2e:p2p` 可证明整个路径：一个真实的二进制文件、两个真实的浏览器、一个真实的 WebRTC 数据通道，服务器自身的在线状态被读回作为事实依据，以及负对照（`e2e-p2p/builtin-rendezvous-p2p.e2e.js`）。全程无任何模拟，也不依赖任何外部服务。

---

### `collab.rendezvous_url` — 改为将发现委托给你自己的中继

默认为空。设置后，它指向一个**外部**发现接口，并优先于上述内置接口 — 配置它本身就是明确的选择，因此它优先生效。适用场景：多个部署共享同一个中继，或需要其 TURN/NAT 穿透支持。

Liwan 按以下顺序选择四种发现路径之一：

1. **本服务器自身的对等网络架构**（`/api/peering/*`）— 仅当 Vulos OS / Pier 部署位于 Liwan 前端时存在。默认行为不变。
2. **已配置的 rendezvous URL** — 任意**自托管 `vulos-relayd`** 的 OPEN rendezvous 接口（announce/resolve/signal/mailbox + ICE）的基础 URL。无需 Vulos OS，也无需账户。

   浏览器会**直接**（跨源）访问该 relayd 的源。Liwan 不为发现挂载任何内容，也不处于该路径中，因此它甚至看不到（对内容不可见的）rendezvous 信封 — 关于中继具体能看到和看不到什么，请参见 [COLLABORATION.md](COLLABORATION.md) §3。作为运维人员，你需要注意两点：

   - relayd 在其 rendezvous 角色上必须提供 **CORS**。每个具备该角色的 Pier 部署都已提供；`npm run test:e2e:p2p` 会从真实浏览器对真实部署进行断言。
   - 必须能从用户加载 Liwan 的地方访问，并且协议须是页面能够调用的：**https** 的 Liwan 无法调用 **http** 的中继，因此公开部署需要为中继配置 TLS。
3. **本二进制自身的内置接口** — 即上面的 `collab.builtin_rendezvous`。**未配置的部署使用的就是这一项。**
4. **仅本地** — 无法访问任何对等节点；编辑器仍可正常工作、自动保存，并诚实地显示（“离线”标识），而不是显示虚假的“实时”。

```yaml
collab:
  rendezvous_url: "https://relay.example.org"   # any self-hosted vulos-relayd
```

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `VULOS_RENDEZVOUS_URL` / `LIWAN_RENDEZVOUS_URL` | 覆盖 `collab.rendezvous_url`。任意 `vulos-relayd` 提供其 rendezvous 接口的 URL。 | —（未设置） |

该值通过未经认证的 `GET /api/reachability`（字段名为 `rendezvous_url`）以**只读**形式暴露给浏览器，因此设置环境变量即可生效，无需重新构建前端 — 同一端点还包含 `public_base_url`，即本服务器自身可从外部访问的源：

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `LIWAN_PUBLIC_URL` | 本 Liwan 实例可从外部访问的源（公共域名，或在 NAT/CGNAT 之后时的 Pier 隧道 URL）。用于构建外部对等节点真正能够访问的 P2P 邀请链接/信令目标，而不是盲目信任 `window.location.origin`（它可能只是局域网地址）。 | —（回退为访问者自己的源） |

未配置时，`rendezvous_url` 为 `""`；如果内置接口已关闭，`builtin_rendezvous_prefix` 为 `""`。客户端会将空值视为“不可用”，而不是猜测默认值；并且拒绝非绝对同源路径的前缀 — 正是这一点确保了刻意设为仅本地的部署保持仅本地，而不会生成永远无法连接任何人的邀请链接，也不会将发现请求发送到非预期的地方。

**不存在任何默认端点。** Liwan 用于发现的每个 URL 都来自本部署：你自己的配置，或页面自身的源。没有任何地址指向 Vulos 运营的服务。

相关选择逻辑参见 `backend/config/config.go` 和 `src/lib/collab/transportSelection.js`；客户端的获取/缓存参见 `src/lib/collab/reachableBase.js`。默认路径已由 `e2e-p2p/builtin-rendezvous-p2p.e2e.js` 端到端验证；外部中继的情况由 `e2e-p2p/rendezvous-p2p.e2e.js` 验证，该测试需要在 `VULOS_RELAYD_BIN` 中提供预编译的 relayd，若缺少则会（带原因地明确）跳过 — 它绝不会在测试时克隆或构建其他仓库。

---

### `collab.ice.*` — 运行时配置的 STUN/TURN（可在发布版二进制上使用）

协作的默认路径是**直连 WebRTC** — 两个浏览器之间直接建立数据通道（参见 [COLLABORATION.md](COLLABORATION.md) §3）。要使该直连在 NAT 之后成功建立，需要 **STUN**（几乎普遍可用，只需告诉你自己的公网地址），以及对于少数位于**对称型 NAT** 之后、根本无法打洞的对等节点对，需要 **TURN**（中继流量；在此处对内容不可见 — 参见 §3）。两者都不需要主机、`vulos-relayd` 或其他任何 Vulos 产品。

在**运行中的服务器**上进行配置，浏览器会从 `GET /api/rendezvous/ice` 获取这些设置：

```yaml
collab:
  ice:
    stun_urls: ["stun:turn.example.org:3478"]
    turn_urls: ["turn:turn.example.org:3478", "turns:turn.example.org:5349"]
    # RECOMMENDED — coturn's static-auth-secret (its REST API). The secret never
    # leaves this process; each response carries a credential valid for turn_ttl_seconds.
    turn_secret: "…"
    turn_ttl_seconds: 3600
    # Or a long-lived pair, served verbatim to any caller. Ignored if turn_secret is set.
    # turn_username: "liwan"
    # turn_credential: "…"
```

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `VULOS_STUN_URLS` / `LIWAN_STUN_URLS` | 逗号分隔的 `stun:` URL。 | — |
| `VULOS_TURN_URLS` / `LIWAN_TURN_URLS` | 逗号分隔的 `turn:`/`turns:` URL。除非设置了下方的某种凭据模式，否则忽略 — 没有凭据的 TURN 条目无法完成认证。 | — |
| `VULOS_TURN_SECRET` / `LIWAN_TURN_SECRET` | coturn 的 `static-auth-secret`。凭据按请求生成，并会过期。 | — |
| `VULOS_TURN_USERNAME` / `LIWAN_TURN_USERNAME` | 长期有效的 TURN 用户名。设置了 secret 时忽略。 | — |
| `VULOS_TURN_CREDENTIAL` / `LIWAN_TURN_CREDENTIAL` | 长期有效的 TURN 凭据。设置了 secret 时忽略。 | — |

**为什么需要运行时设置。** 下面的 `VITE_*` 变量会在构建时嵌入 JS 包中，因此下载发布版二进制文件或拉取容器的运维人员**无法在不重新构建前端的情况下设置它们** — 这使得 [COTURN.md](COTURN.md) 对其真正的目标读者毫无用处。这些字段包含同样的信息，只是放在运维人员真正能够提供的地方。

**该端点会暴露什么。** `GET /api/rendezvous/ice` 无需认证 — 浏览器在拥有任何会话之前就需要 ICE 服务器 — 因此此处配置的任何内容，任何能够访问该机器的人都可以读取。对于 STUN 而言这没有问题（STUN 服务器只会告诉调用者它自己的地址）。对于 TURN，建议使用 `turn_secret`：secret 保留在服务器端，每个响应携带短期凭据，因此泄露的响应会过期，而不会成为永久授权。`turn_username`/`turn_credential` 适用于没有 REST secret 的部署，并会原样下发 — 按其本来面目说明，而不做粉饰。

未配置时，该端点返回**空**列表，浏览器会将其理解为“从我自己的配置中获取”，因此对于已通过打包变量完成设置的部署，保持此项不变不会产生任何影响。

---

### `VITE_STUN_URLS` / `VITE_TURN_*` — 构建时的相同功能

由 `src/lib/collab/webrtc/call/ice.js` 使用的构建时环境变量。当上方服务器端 ICE 响应为空（或不可用）时使用：

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `VITE_STUN_URLS` | 逗号分隔的 `stun:` URL，例如 `stun:stun.example.org:3478`。设置为空字符串 `''` 可完全禁用 STUN（而不仅仅是取消设置）。 | 公共 Google STUN 服务器 |
| `VITE_TURN_URL` | 逗号分隔的 TURN 服务器 `turn:`/`turns:` URL，例如 `turn:turn.example.org:3478,turns:turn.example.org:5349`。 | —（默认无 TURN） |
| `VITE_TURN_USERNAME` | TURN 用户名（coturn `lt-cred-mech`：静态 `user=` 名称，或限时凭据的用户名部分）。 | — |
| `VITE_TURN_CREDENTIAL` | 与 `VITE_TURN_USERNAME` 对应的 TURN 凭据/密码。 | — |

这些设置作为**备用**生效 — 即当所用 ICE 端点（主机上的 `/api/peering/ice`、本二进制上的 `/api/rendezvous/ice`，或已配置中继的 ICE 接口）不可访问或返回为空时。TURN 从不设置默认值（不同于 STUN）：TURN 服务器会中继你的流量，因此仅通过上述变量显式选择启用。

宿主页面也可以通过 `window.__VULOS_ENDPOINTS__` 在运行时注入这些设置，而不是在构建时注入：

```js
window.__VULOS_ENDPOINTS__ = {
  stunUrls: ['stun:stun.example.org:3478'],
  turn: { urls: ['turn:turn.example.org:3478'], username: 'liwan', credential: '…' },
}
```

**自行搭建 TURN 服务器：** 请参阅 [COTURN.md](COTURN.md)，其中提供了完整可运行的 coturn 配置（apt 和 Docker 两种方式）、最小化的 `turnserver.conf`、需要开放的防火墙端口，以及应将上述哪些设置指向它 — 如果你运行的是发布版二进制文件，则使用运行时的 `collab.ice.*`；如果你自行构建前端，则使用构建时的 `VITE_*`。

---

## 环境变量

### 认证 / JWT

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `LIWAN_JWT_SECRET` | HS256 签名密钥 — 当 `auth.enabled: true` 时**必填** | — |
| `LIWAN_REGISTRATION_TOKEN` | 静态的备用注册令牌（建议使用邀请令牌） | — |

### SSO 会话内省（多用户）

Liwan **不持有任何会话签名权限**。当配置了身份提供方时，它会通过内省来验证浏览器的 `vc_session` Cookie，而不是验证 Liwan 自己签发的签名。

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `IDENTITY_URL` | 身份提供方的基础 URL（自托管时为自主主机，云端时为控制平面）。**已设置** → Liwan 会通过 `POST {IDENTITY_URL}/api/session/introspect` 内省 `vc_session`，并在会话无效/过期/无法访问时**失败关闭**（返回 401）。**未设置** → 禁用 SSO；本地单一身份的既有行为保持不变。 | —（未设置） |
| `VULOS_CP_TOKEN` | 在内省调用中以 `X-Relay-Auth` 提交的共享服务认证密钥（即提供方的 `CP_SHARED_SECRET`）。复用自现有的 API 密钥/权益路径 — **不是签名密钥**。 | —（未设置） |

优先级（先匹配者生效）：`vk_` API 密钥 → 每产品会话 JWT → SSO `vc_session` 内省 → 401。有效会话下，请求会被限定在解析得到的**用户 + 租户**范围内（`tenantId` = 账户 ID）；结果在进程内缓存约 45 秒（以会话的 `expiresAt` 为上限），因此并非每个请求都要往返一次。

**运维速查**

- 自托管单用户主机：保持 `IDENTITY_URL` 未设置即可，无需其他操作。
- 使用外部身份/控制平面的多用户部署：将 `IDENTITY_URL` 指向你自己的控制平面主机（没有默认主机 — 保持未设置则主机保持自包含），并设置 `VULOS_CP_TOKEN=<CP 共享密钥>`（如果你同时保留了原生 JWT 登录，则还需设置 `auth.enabled: true` / `LIWAN_JWT_SECRET`）。

### 持久化

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `VULOS_PERSISTENCE_UPDATELOG` / `LIWAN_UPDATE_LOG` | 启用 CRDT 更新日志（覆盖 `persistence.updatelog`）。接受 `1/true/on/yes`。 | `false` |

### 数据库路径（SQLite）

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `VULOS_USERAUTH_DB` | 每用户凭据存储的 DSN | `./data/userauth.db` |
| `VULOS_INVITES_DB` | 邀请令牌存储的 DSN | `./data/invites.db` |
| `VULOS_AUDIT_DB` | 仅追加的审计日志 DSN | `./data/audit.db` |
| `VULOS_FILEACL_DB` | 文件 ACL 存储的 DSN（仅 SQLite 后端） | `./data/fileacl.db` |

### S3 兼容存储（默认 Tigris）

以下变量由 `backend/storage/backendconfig.go` 中的 `OfficeTigrisDefaults()` 使用：

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `TIGRIS_ENDPOINT` | S3 兼容的端点 URL | `https://fly.storage.tigris.dev` |
| `TIGRIS_REGION` | 存储区域 | `auto` |
| `TIGRIS_ACCESS_KEY_ID` | 访问密钥 | — |
| `TIGRIS_SECRET_ACCESS_KEY` | 密钥 | — |

对于自带存储（BYO）或 MinIO 部署，请直接注入 `OfficeBackendConfig`（参见 [INSTALL.md](INSTALL.md)）。

### 套件（与 Vulos OS 共享）

由 OS 存储模式选择器写入；由全部三个套件服务使用：

| 变量 | 说明 |
|----------|-------------|
| `VULOS_STORAGE_MODE` | `central-tigris`（默认）或 `local-minio-sync` |
| `VULOS_MINIO_ENDPOINT` | MinIO 端点（仅在 `local-minio-sync` 模式下使用） |
| `VULOS_MINIO_REGION` | 区域（默认 `auto`） |
| `VULOS_MINIO_BUCKET` | 共享存储桶名称 |
| `VULOS_MINIO_CREDS_REF` | 凭据文件的路径 |

### SMTP（可选）

Liwan 本身不发送邮件。如果需要外发通知，请将 Liwan 指向外部 SMTP 中继：

| 变量 | 说明 |
|----------|-------------|
| `SMTP_HOST` | SMTP 中继主机 |
| `SMTP_PORT` | SMTP 端口（默认 `587`） |
| `SMTP_USER` | SMTP 用户名 |
| `SMTP_PASSWORD` | SMTP 密码 |
| `SMTP_FROM` | 发件人地址 |

### 可观测性（OpenTelemetry）

| 变量 | 说明 |
|----------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 用于追踪的 OTLP 端点（可选） |
| `OTEL_SERVICE_NAME` | 服务名称标签（默认 `liwan`） |

Prometheus 指标始终可通过 `GET /metrics` 访问（无需环境变量）。

---

## 组织存储桶配置

`backend/storage/backendconfig.go` 提供 `OfficeBackendConfig`，用于每个组织的 S3 存储桶 + CRDT 快照配置，由托管多租户部署的任何控制平面注入（自行配置 — Vulos 不运营任何控制平面）。这是此类部署的标准配置路径 — 请勿在环境变量中重复配置。

---

## 另请参阅

- [GETTING-STARTED.md](GETTING-STARTED.md) — 首次运行指南
- [DEPLOY.md](DEPLOY.md) — 生产环境部署
- [INSTALL.md](INSTALL.md) — 单机套件安装
- [ARCHITECTURE.md](ARCHITECTURE.md) — 组件架构图
