# Liwan 议事厅 — 管理员指南

本章面向运行 Liwan 议事厅的管理员：涵盖部署（裸二进制、Docker、Fly.io，或作为 Vulos OS 套件的一部分）、配置（`config.yaml` + 环境变量）、了解文档在磁盘上的实际存储位置、启用多用户认证、与 Vulos OS 集成，以及备份。Liwan 是一个**内嵌完整 Web 应用的单一 Go 二进制文件**，默认部署为一个进程、一个端口（`:8080`）、一个数据目录，无需任何外部依赖。本文中提到的每个端点和变量都存在于本仓库的代码中。

---

## 1. 部署方式

### 1.1 单一二进制文件（最简单）

```bash
npm install
npm run build          # builds the frontend into dist/ and compiles the Go binary
./liwan
# → http://localhost:8080
```

数据存放在工作目录下的 `./data` 和 `./uploads` 中。在零配置的情况下，将以单用户模式运行：无认证、本地存储、不连接云端。

常用调用方式：

```bash
./liwan --version            # print build version
./liwan version              # same
./liwan --no-rate-limit-writes   # disable write/collab token-bucket (trusted/internal only)
./liwan migrate up           # apply storage schema migrations (idempotent)
./liwan migrate status       # show which application tables exist
./liwan migrate-credential -admin you@example.org [-password PW]
                                    # one-shot: convert a legacy shared-password deploy
                                    # to a per-user credential (no-op once any user exists)
```

### 1.2 Docker

```bash
docker run -d \
  --name liwan \
  -p 8080:8080 \
  -v office-data:/srv/data \
  ghcr.io/greenchennai/liwan:latest
```

镜像信息（来自 `Dockerfile`）：

- 以非 root 用户 `vulos`（uid 10001）运行，`WORKDIR /srv`，因此数据位于 **`/srv/data`**，上传文件位于 **`/srv/uploads`**。请将卷挂载到 `/srv/data`（如果希望上传的图片在重新部署后保留，还需挂载到 `/srv/uploads`，因为标准镜像只声明了数据卷）。
- `EXPOSE 8080`；内置的 `HEALTHCHECK` 会轮询 `GET /healthz`。
- 二进制文件为静态编译（关闭 CGO；通过纯 Go 实现的 pgx 访问 Postgres），运行在 Alpine 上。

**自行构建镜像**：WebRTC 协作组件是 `src/lib/collab/webrtc/` 下的自有源代码（无需单独的包，也无需检出同级仓库），因此在仓库根目录下直接构建总是可行的：

```bash
docker build -t ghcr.io/greenchennai/liwan:latest .
```

### 1.3 Fly.io

仓库中已包含 `fly.toml`。由于 Fly 的构建上下文为配置文件所在目录，请先在外部构建并推送镜像，然后通过镜像引用进行部署：

```bash
docker build -t ghcr.io/greenchennai/liwan:latest .
docker push ghcr.io/greenchennai/liwan:latest
fly deploy -c fly.toml --image ghcr.io/greenchennai/liwan:latest
```

该配置会挂载卷 `office_data` 到 `/srv/data`，检查 `/healthz`，强制使用 HTTPS，并说明需要将 `DATABASE_URL` / `IDENTITY_URL` / `VULOS_CP_TOKEN` 设置为 Fly 密钥。

### 1.4 Vulos OS 套件

若要部署一台完整的自主主机（OS + 邮件 + Liwan 共享同一身份和存储架构），请使用 [INSTALL.md](INSTALL.md) / [GETTING-STARTED.md](GETTING-STARTED.md) 中描述的套件安装程序。该套件还提供 `/api/peering/*` 架构端点，可启用低延迟的点对点协作和跨应用在线状态，并且是唯一能将已认证的账户会话绑定到对等节点身份的发现途径。独立运行的 Liwan 二进制文件不提供这些端点，而是在 `/api/rendezvous/*` 上提供其自身的等效发现接口（默认开启），因此点对点协作在两种方式下均可使用（参见 [COLLABORATION.md](COLLABORATION.md) §3）。

---

## 2. 配置

服务器从**工作目录中读取 `config.yaml`**（`migrate` 子命令接受 `-config <path>`；服务器本身加载 `./config.yaml`）。若文件缺失则使用默认值，并输出日志 `Config error: … — using defaults`。环境变量会覆盖文件中的配置。

```yaml
server:
  addr: ":8080"            # listen address
  data_dir: "./data"       # documents, versions, envelopes, SQLite stores
  uploads_dir: "./uploads" # uploaded images/files

auth:
  enabled: false           # true = require login
  password: "changeme"     # legacy shared password (migration source only)
  max_attempts: 5          # failed logins before lockout
  lockout_minutes: 15
  session_hours: 24        # JWT session lifetime

storage:
  type: "local"            # "local" (JSON files) or "postgres"
  postgres:
    host: "localhost"
    port: 5432
    user: "postgres"
    password: ""
    database: "liwan"
    sslmode: "disable"
```

### 环境变量

核心：

| 变量 | 用途 |
|----------|---------|
| `DATABASE_URL` | 完整的 `postgres://…` URL。设置后将选用 Postgres 存储（schema 为 `office`），并覆盖 `storage.type`。 |
| `VULOS_DATABASE_URL` | 别名，在 `DATABASE_URL` 未设置时检查。 |
| `LIWAN_JWT_SECRET` | 用于会话 JWT 的 HS256 密钥。**当 `auth.enabled: true` 时必填** — 没有该密钥服务器将拒绝启动（启动时致命错误）。 |
| `LIWAN_DEV` | `1` 表示使用明确标注的不安全开发密钥。切勿在生产环境中使用。 |
| `LIWAN_CORS_ORIGINS` | 逗号分隔的允许来源列表（允许携带凭据）。未设置时 ⇒ 允许所有来源，但**不携带凭据** — 启动日志会说明当前处于哪种模式。 |
| `LIWAN_REGISTRATION_TOKEN` | 静态的备用注册令牌（建议使用已生成的邀请令牌）。 |

SQLite 存储路径（默认位于 `data_dir` 下）：

| 变量 | 默认值 |
|----------|---------|
| `VULOS_USERAUTH_DB` | `./data/userauth.db` |
| `VULOS_INVITES_DB` | `./data/invites.db` |
| `VULOS_AUDIT_DB` | `./data/audit.db` |
| `VULOS_FILEACL_DB` | `./data/fileacl.db` |

SSO / 云端接口（均为可选；未设置则完全独立运行）：

| 变量 | 用途 |
|----------|---------|
| `IDENTITY_URL` | 身份提供方的基础 URL。设置后，Liwan 会通过 `POST {IDENTITY_URL}/api/session/introspect` 验证浏览器的 `vc_session` Cookie，并采用**失败即拒绝**策略（无效或无法访问时返回 401）。未设置 ⇒ 禁用 SSO 路径。 |
| `VULOS_CP_BASE_URL` | 外部控制平面 URL（Vulos 不运营任何控制平面 — 如果你自己运行控制平面，请填写其地址）。启用权益/用量适配器，以及 `/v1` 的 `vk_` API 密钥内省路径。未设置 ⇒ 不运行上述任何代码。 |
| `VULOS_CP_TOKEN` | 以 `X-Relay-Auth` 形式提交给控制平面 / 身份提供方的服务令牌。它不是签名密钥。 |
| `VULOS_ORG_ID` | 云适配器和存储使用的租户/组织范围标识。 |

对象存储 / 套件（可选）：`TIGRIS_ENDPOINT`、`TIGRIS_REGION`、`TIGRIS_ACCESS_KEY_ID`、`TIGRIS_SECRET_ACCESS_KEY`，以及套件共享的 `VULOS_STORAGE_MODE`、`VULOS_MINIO_ENDPOINT`、`VULOS_MINIO_REGION`、`VULOS_MINIO_BUCKET`、`VULOS_MINIO_CREDS_REF` — 完整对照表请参阅 [CONFIGURATION.md](CONFIGURATION.md)。

可观测性：`OTEL_EXPORTER_OTLP_ENDPOINT`、`OTEL_SERVICE_NAME`（默认 `liwan`）。

SMTP（`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD`、`SMTP_FROM`）— 仅在独立部署中用于发送外发通知邮件时相关。

每个请求的认证优先级：`vk_` API 密钥 → Liwan 会话 JWT → SSO `vc_session` 内省 → 401。内省结果会在进程内缓存约 45 秒。

---

## 3. 文档的存储位置（存储）

### 3.1 本地存储（默认）

所有内容都是可直接查看的 JSON 文件，位于 `data_dir` 下：

| 路径 | 内容 |
|------|----------|
| `data/<fileID>.json` | 每个文档一个 JSON 文件（元数据 + 内容） |
| `data/versions/<fileID>_<versionID>.json` | 版本快照 |
| `data/folders/` | 文件夹树 |
| `data/comments/`、`data/replies/`、`data/suggestions/` | 批注 |
| `data/envelopes/`、`data/signers/`、`data/sealed/` | 签署信封、签署人记录、封存的 PDF |
| `data/audit/<envelopeID>/<eventID>.json` | 每个信封的签署审计事件 |
| `data/userauth.db`、`invites.db`、`audit.db`、`fileacl.db` | SQLite：凭据、邀请、安全审计日志、每文件 ACL |
| `uploads/` | 上传的图片（每个上限 10 MB，检测内容类型，使用 UUID 文件名） |

用于构建路径的每个 ID 都会根据严格的模式进行校验（仅允许字母/数字/`_`/`-`），因此存储层会拒绝通过构造 ID 进行的路径遍历攻击。

### 3.2 Postgres（多用户 / 云端）

设置 `DATABASE_URL`（或 `storage.type: postgres`）。Liwan 使用数据库中的专用 schema **`office`**，因此可与同一共享 Postgres/Neon 项目中的其他 Vulos 产品共存。表会在首次启动时自动创建；`./liwan migrate up` 可显式应用相同的迁移（幂等 — 升级后、滚动重启前运行即可），`migrate status` 会列出已存在的表。文件 ACL 也会迁移到 Postgres 中（`backend/storage/fileacl_postgres.go`）。

### 3.3 对象存储（可选）

`backend/storage/backendconfig.go` 提供 `OfficeBackendConfig`（通过 `TIGRIS_*` 变量设置 Tigris 默认值），用于每个组织的 S3 存储桶 + CRDT 快照配置，由托管的多租户部署中的控制平面注入。独立安装无需此配置。

---

## 4. 启用多用户认证

1. 在 `config.yaml` 中设置 `auth.enabled: true`。
2. `export LIWAN_JWT_SECRET="$(openssl rand -hex 32)"` — 缺少该密钥时启动会明确失败。
3. 启动服务器，然后通过 `POST /api/auth/register` 创建第一个用户（使用 `LIWAN_REGISTRATION_TOKEN` 或邀请令牌），或使用 `./liwan migrate-credential -admin <account>` 将旧的共享密码安装转换为新方式。
4. 使用管理员账户，打开**设置 → 管理**，生成**邀请令牌**（一次性使用，有有效期；原始令牌仅显示一次），并查看**审计日志**（ACL 授予/撤销、注册、邀请事件、角色变更）。

需要注意的相关行为：

- 登录有速率限制和锁定保护（`max_attempts` / `lockout_minutes`）。
- 启用认证（多租户）后，**本地文件浏览/服务路由已禁用**（`/api/local-files*`），以避免在租户之间暴露服务器的主目录；启动日志会明确说明这一点。因此“从服务器文件夹打开”功能仅限单用户使用。
- 写入端点（文件、评论、协作操作、上传等）共享每 IP 令牌桶：突发 30，每秒补充 10 个。仅在可信环境中使用 `--no-rate-limit-writes` 禁用。
- 上传受计费/权益限制（`GateStorage`）— 在独立模式下上限不受限制，因此此项无实际作用。

---

## 5. 与 Vulos OS 集成

- **嵌入**：每个编辑器模块都以 npm 库 `liwan` 的形式发布，入口为 `liwan/docs`、`liwan/sheets`、`liwan/slides`、`liwan/whiteboard`、`liwan/pdf`，Vulos OS（或你自己的应用）可将它们挂载为原生面板。由 `vite.config.lib.js` 构建到 `dist-lib/`。（Go 模块及其构建的二进制文件名为 `liwan`；npm 包和产品名称都是 Liwan。）
- **身份**：在 Vulos OS 主机上，设置 `IDENTITY_URL`，使 Liwan 通过内省验证共享的 `vc_session` Cookie — 在该模式下 Liwan 有意不持有任何会话签名权限。
- **对等网络架构**：OS/Pier 主机提供 `/api/peering/stream`（WebSocket 信令）和 `/api/peering/ice`；Liwan 的协作代码会同源发现它们，并自动启用点对点协作和在线状态。如果没有主机端架构，Liwan 会在 `/api/rendezvous/*` 上提供自己的发现接口（`collab.builtin_rendezvous`，默认开启），因此点对点协作在裸二进制上无需任何配置即可运行；你也可以通过 `collab.rendezvous_url` / `VULOS_RENDEZVOUS_URL` 将其指向自托管的 `vulos-relayd`（参见 [CONFIGURATION.md](CONFIGURATION.md)）。只有在内置接口被关闭**且**未配置中继时，才会降级为仅本地模式。
- **控制平面**（自行配置，多租户）：`VULOS_CP_BASE_URL` + `VULOS_CP_TOKEN` + `VULOS_ORG_ID` 可启用权益检查（`GET {CP}/api/entitlements`，在控制平面临时故障时放行）、用量计量（即发即忘的 `POST {CP}/api/usage`），以及 `/v1` 的 `vk_` API 密钥内省（密钥验证期间若控制平面不可达，则以 `503` 失败关闭）。Vulos 不为你运营任何控制平面可供指向。完整的接口约定请参阅 [SELFHOST.md](SELFHOST.md)。

---

## 6. 在反向代理之后运行

Liwan 在同一端口上同时提供应用和 API，因此代理只需一个 location 块。注意：Liwan 本身**不托管**任何长连接的协作流 — 协作是点对点的，没有中心化文档服务器（参见 [COLLABORATION.md](COLLABORATION.md)）。只有一种路径需要特别注意，并且仅出现在 Vulos OS/Pier 主机上：

- **WebSocket**（`/api/peering/stream`）：对内容不可见的对等发现信令通道。它仅在 Vulos OS/Pier 主机提供对等网络架构时存在；如果你代理了此类部署，必须转发 `Upgrade`/`Connection` 头部并保持较长的读取超时，否则对等节点将无法互相发现（参见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §3）。
- **`/api/rendezvous/*`**（独立二进制自身提供的内置对等发现，默认开启）：普通的同源 JSON，通过 `GET`/`POST` 传输，**不需要 WebSocket 升级**。它采用**长轮询**，会将请求挂起最多 25 秒，等待对等节点的信令，因此代理的读取超时若低于约 30 秒，会切断每次轮询，导致发现变慢或失败。下面的 `proxy_read_timeout 1h` 同时覆盖此项和上面的 WebSocket。如果直接访问二进制时 `/api/rendezvous/healthz` 返回正常，而经过代理后返回 `404`，说明代理没有正确转发该路径。

nginx 示例：

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;      # websockets (peering-fabric discovery)
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 1h;                        # keep the discovery WS open
}
```

同时也请注意每 IP 的速率限制：写入（突发 30，每秒补充 10）以及内置发现接口（突发 240，每秒补充 40）。如果代理隐藏了客户端 IP，**所有用户将共享同一个令牌桶**。请保留真实的客户端地址（如上面的 `X-Forwarded-For`，并确保 Liwan 信任该头部），或有意放宽限制。整个办公室位于同一 NAT 地址之后，完全处于发现限制范围之内；而如果代理将每个用户都显示为 `127.0.0.1`，那么这与限制过于严格是两回事。

---

## 7. 安全加固清单

- [ ] `auth.enabled: true` 并设置强 `LIWAN_JWT_SECRET`（32 字节以上的随机数据）；生产环境中切勿使用 `LIWAN_DEV=1`。
- [ ] 前端使用 TLS（反向代理或 Fly 的 `force_https`）；会话 Cookie 为 HttpOnly，但传输安全由你负责。
- [ ] 如果有任何组件嵌入 Liwan 或从其他来源调用它，请将 `LIWAN_CORS_ORIGINS` 设置为你的确切来源。
- [ ] 首个管理员创建后，仅通过**邀请**进行注册（避免保留静态的 `LIWAN_REGISTRATION_TOKEN`）。
- [ ] 保持写入速率限制开启（不要在面向互联网的环境中使用 `--no-rate-limit-writes`）。
- [ ] 为 `data/` **和** `uploads/` 配置卷，并测试备份（参见 §9）。
- [ ] 定期查看审计日志（设置 → 管理）— 每一次共享/角色/邀请/注册事件都会以只追加方式记录。
- [ ] 如果未使用云端接口，请保持 `VULOS_CP_BASE_URL`、`IDENTITY_URL` 未设置 — 此时适配器代码根本不会运行。
- [ ] 向用户说明“通过链接协作”的端到端加密特性：这些会话对你的服务器内容不可见，且无法进行集中审计（[COLLABORATION.md](COLLABORATION.md) §5）。

仓库中还附带了 [SECURITY.md](../SECURITY.md)、[THREAT-MODEL.md](THREAT-MODEL.md) 和 [SECURITY-TESTING.md](SECURITY-TESTING.md)，其中包含完整的安全模型及其回归测试。

---

## 8. 可观测性与运维

| 端点 | 用途 |
|----------|---------|
| `GET /healthz` | 存活检查 — `{"status":"ok","version":"…"}`（供 Docker/Fly 健康检查使用） |
| `GET /version` | 构建版本 |
| `GET /metrics` | Prometheus 指标（始终开启） |

- **日志输出到 stdout/stderr**（标准 Go log + Gin 请求日志）。没有日志文件 — 请使用 `docker logs`、`journalctl` 或 `fly logs` 进行采集。启动时会输出各项重要模式决策的信息行：`[seam] integration mode: …`、`[sso] session introspection …`、`[cors] …`、`[rate-limit] …`、`[v1] API-key path …`、`[local-files] …`、`[apps] …`。
- **追踪**：设置 `OTEL_EXPORTER_OTLP_ENDPOINT` 以导出 OpenTelemetry 数据。
- **安全审计**：应用级审计记录（共享、角色、邀请、注册）保存在 `data/audit.db` 中，可在管理面板中查看。签署信封的审计事件则单独保存在 `data/audit/` 下。

---

## 9. 备份与恢复

需要备份的内容：

| 部署方式 | 备份内容 |
|------------|---------|
| 本地存储（默认） | 整个 **`data/`** 目录（文档、版本、批注、信封、封存的 PDF，以及全部四个 SQLite 数据库）**和 `uploads/`**（文档中的内嵌图片存放在此处 — 丢失将导致文档中的图片失效） |
| Docker | `/srv/data` 处的卷（若挂载了 `/srv/uploads` 则一并备份） |
| Postgres | `office` schema 的 `pg_dump`，以及 `uploads/`（除非配置了对象存储，否则上传文件保存在本地磁盘） |
| `config.yaml` + 环境变量/密钥 | 始终需要备份 — 尤其是 `LIWAN_JWT_SECRET`（丢失将使所有会话失效，但不会丢失数据） |

实用建议：

- 本地模式下的所有内容都是平面文件 + SQLite：在流量静止时对 `data/` + `uploads/` 进行文件系统快照或 `tar` 打包，即可得到完整备份。对 SQLite 存储进行热备份时，建议使用 `sqlite3 <db> ".backup <dest>"`，而不是直接复制文件。
- 版本历史属于 `data/versions/` 的一部分 — 只备份文档而不备份版本，将丢失恢复点。
- **“通过链接协作”的端到端加密房间不在服务器上存储任何内容** — 每位参与者的浏览器会保存本地快照，而他们自己的保存内容则像平常一样进入其账户存储。因此无需额外备份，如果房间链接丢失，服务器端也无法恢复（请轮换或重新分享）。
- 恢复：将 `data/` + `uploads/` 放回工作目录（或恢复卷 / 对转储文件执行 `psql`），然后启动二进制文件；若将 Postgres 转储恢复到较新版本的二进制上，请先运行 `./liwan migrate up`。
- 测试恢复：启动一个临时容器，使用备份副本运行，然后访问 `/healthz` 并打开一份文档以验证。

---

## 10. 升级检查清单

1. 备份（如上所述）。
2. 拉取/构建新的镜像或二进制文件。
3. Postgres：在滚动重启之前或期间运行 `./liwan migrate up`（幂等）；本地存储会自动迁移。
4. 观察启动日志中你期望看到的模式提示行（seam/SSO/CORS/速率限制）。
5. 验证 `/healthz`，然后登录并打开一份文档。

有关故障现象及其解决方法，请继续阅读 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。
