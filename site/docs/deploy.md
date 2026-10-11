# Liwan – 部署指南

## 系统要求

- Linux 主机或容器运行时
- Go 1.21+
- Node.js 20+（用于构建前端）
- PostgreSQL（可选；默认使用 SQLite）

## 快速开始（Docker）

```sh
docker run -d \
  --name liwan \
  -p 8080:8080 \
  -v office-data:/data \
  ghcr.io/greenchennai/liwan:latest
```

## 从源码构建

```sh
git clone https://github.com/GreenChennai/liwan.git
cd liwan

# Build frontend
npm ci && npm run build

# Build backend (no CGO required)
CGO_ENABLED=0 go build -trimpath -o liwan .
./liwan
```

## 配置

将 `config.yaml.example` 复制为 `config.yaml` 并进行编辑：

```yaml
server:
  addr: ":8080"
  uploads_dir: "/data/uploads"
auth:
  enabled: true
  jwt_secret: "<secret>"
database:
  driver: sqlite   # or postgres
  dsn: "/data/office.db"
```

## 环境变量

| 变量 | 说明 |
|----------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTel OTLP 端点（可选） |
| `LIWAN_JWT_SECRET` | HS256 签名密钥（启用认证时必填） |
| `LIWAN_REGISTRATION_TOKEN` | 静态的备用注册令牌（可选；建议优先使用邀请令牌） |
| `VULOS_USERAUTH_DB` | 每用户凭据 SQLite DSN（默认 `./data/userauth.db`） |
| `VULOS_INVITES_DB` | 邀请令牌 SQLite DSN（默认 `./data/invites.db`） |
| `VULOS_AUDIT_DB` | 仅追加的审计日志 SQLite DSN（默认 `./data/audit.db`） |
| `VULOS_FILEACL_DB` | 文件 ACL SQLite DSN，仅适用于 sqlite 后端（默认 `./data/fileacl.db`） |

## 账户、注册与邀请

- **登录**会对照每用户的凭据存储（bcrypt）进行验证。在**尚未注册任何用户**时，实例处于 OSS 单用户模式，旧的共享 `auth.password` 仍可用于认证。
- 在已完成初始化（至少有 1 个用户）的实例上，**注册**需要授权：管理员 JWT、静态的 `LIWAN_REGISTRATION_TOKEN`，**或**由管理员生成的一次性/限时**邀请令牌**（`POST /api/admin/invites`，或管理控制台中的 UI）。邀请令牌以哈希形式存储，原始令牌仅在生成时显示一次。
- 所有 ACL 授予/撤销、注册和邀请事件都会记录在仅追加的**审计日志**中（`GET /api/admin/audit`，仅管理员可访问）。

## 可观测性

- `GET /metrics` — Prometheus `liwan_*` 指标。
- 设置了 `OTEL_EXPORTER_OTLP_ENDPOINT` 时输出 OTel 链路追踪（traces）。

## 升级

停止服务，替换二进制文件，然后重新启动。SQLite 的 schema 带有版本号，启动时会自动迁移。

### 从共享密码部署升级（避免被锁定）

较早的部署使用单一的共享 `auth.password` 和客户端声明的账户 ID。升级后，在已完成初始化的实例上登录需要**每用户的凭据**——因此，如果你在迁移之前添加了其他用户，原有的运维人员将无法再使用共享密码登录。

请在升级后（且在添加其他用户之前）**运行一次**一次性迁移命令，以便用你现有的共享密码为第一个账户生成每用户凭据：

```bash
# Uses auth.password from config.yaml unless -password is given.
./liwan migrate-credential -admin you@vulos.org

# Or pass an explicit password / DB path:
./liwan migrate-credential -admin you@vulos.org -password 's3cret' -db /data/userauth.db
```

该命令是**幂等**的——一旦存在任何用户，它便不再执行任何操作，因此可以安全地在每次启动或入口脚本中运行。迁移完成后，使用该账户及共享密码登录，然后生成邀请令牌（管理控制台 → Invites，或 `POST /api/admin/invites`），以便为团队其他成员开通账户。
