# Liwan — 入门指南

本指南将带你首次运行 Liwan，无论你需要的是快速搭建本地开发环境，还是进行生产环境部署。

---

## 前置条件

| 要求 | 最低版本 | 推荐版本 |
|-------------|---------|-------------|
| Go | 1.21 | 1.22+ |
| Node.js | 18 | 20 LTS |
| npm | 9 | 10 |
| 操作系统 | Linux / macOS | Linux（生产环境） |

---

## 方案 A — 开发服务器（推荐的第一步）

开发服务器会同时运行 Vite（前端，支持热重载）和 Go API：

```bash
git clone https://github.com/GreenChennai/liwan.git
cd liwan

npm install
go mod tidy

npm run dev:web
```

- 前端：[http://localhost:5173](http://localhost:5173)
- Go API：[http://localhost:8080](http://localhost:8080)
- Vite 会自动将 `/api/*` 代理到 Go 后端。

默认情况下认证处于**禁用**状态（`config.yaml` 中的 `auth.enabled: false`），因此本地使用无需登录。

---

## 方案 B — 生产环境二进制文件

```bash
# Build the frontend, then compile everything into a single Go binary
npm ci
npm run build:frontend
go build -o liwan .

# Run
./liwan
```

打开 [http://localhost:8080](http://localhost:8080)。

---

## 方案 C — Docker

```sh
docker run -d \
  --name liwan \
  -p 8080:8080 \
  -v office-data:/srv/data \
  -v office-uploads:/srv/uploads \
  ghcr.io/greenchennai/liwan:latest
```

镜像从 `/srv` 运行服务器（参见 Dockerfile），因此请挂载 `/srv/data`（SQLite 存储 + JSON 文件/文档存储）和 `/srv/uploads`（上传文件暂存区）以实现持久化——这两个路径在镜像中均已声明为 `VOLUME`。启用认证时，请传入 `-e LIWAN_JWT_SECRET=<secret>`。

---

## 方案 D — Vulos OS 捆绑包（推荐用于生产环境）

如果你运行的是完整的 Vulos OS 技术栈，请使用捆绑安装程序，它会同时部署 OS、邮件和办公套件：

```sh
# Tigris-backed (default)
curl -fsSL https://get.vulos.org | sudo bash

# Local-MinIO-backed (BYO single-box)
curl -fsSL https://get.vulos.org | sudo bash -s -- --storage=minio

sudo systemctl enable --now vulos-bundle.target
```

同机部署的细节与共享存储配置参见 [INSTALL.md](INSTALL.md)。

---

## 配置

复制或编辑仓库根目录下的 `config.yaml`：

```yaml
server:
  addr: ":8080"
  data_dir: "./data"
  uploads_dir: "./uploads"

auth:
  enabled: false       # true = require password login
  password: "changeme"
  max_attempts: 5
  lockout_minutes: 15
  session_hours: 24

storage:
  type: "local"        # "local" (JSON files) or "postgres"
  postgres:
    host: "localhost"
    port: 5432
    user: "postgres"
    password: ""
    database: "liwan"
    sslmode: "disable"
```

完整的环境变量与可观测性参考参见 [CONFIGURATION.md](CONFIGURATION.md)。

---

## 首次使用

1. 打开应用。未启用认证时，主屏幕会立即加载。
2. 点击 **New**，创建文档、表格或演示文稿。
3. 打开 PDF，即可查看、批注或设置签名。

> 日历和通讯录已不再是 Liwan 的组成部分——它们通过邮件连接器（经由 lilmail 的 CalDAV/CardDAV）提供。Liwan 侧边栏会直接链接到该功能界面。

---

## 后续步骤

- [CONFIGURATION.md](CONFIGURATION.md) — 环境变量、SMTP、OTEL、org-bucket
- [ARCHITECTURE.md](ARCHITECTURE.md) — 各组件如何协同工作
- [DEPLOY.md](DEPLOY.md) — 生产部署选项
- [INSTALL.md](INSTALL.md) — 与 Vulos OS 的单机同机部署
- [../ROADMAP.md](../ROADMAP.md) — 规划中的功能
