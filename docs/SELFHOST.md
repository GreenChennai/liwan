# 自托管 Liwan（独立运行，无需云）

Liwan 以开源项目的形式**完全独立运行**，**不依赖任何外部控制平面**——Vulos 不为 Liwan 运营任何托管的控制平面。
独立运行方式是默认方式，**无需任何外部配置**即可工作。连接你自己的控制平面集成是**可选的**，并完全封装在一个清晰的接口层之后。

## 快速开始（零云配置）

```sh
# Build (frontend is embedded in the binary under dist/)
go build -o liwan .

# Run — single-user / local mode, no auth, no cloud
./liwan
# → http://localhost:8080
```

就这样。在未设置任何环境变量的情况下：

- **身份**为本地身份：在单用户模式下，每个请求都视为 `self` 账户。若要启用多用户认证，请在 `config.yaml` 中设置 `auth.enabled: true` 并配置 JWT 密钥（见下文）。
- **权益**为无限制（`tier: self-hosted`）——没有计量、没有配额，所有功能均已启用。
- **用量计量**为空操作（no-op）。运行指标仍会通过 `/metrics`（Prometheus）导出；若设置了 `OTEL_EXPORTER_OTLP_ENDPOINT`，则同时导出链路追踪。
- **存储**为本地 SQLite，位于 `./data` 和 `./uploads` 下。不需要对象存储，也不需要 `VULOS_ORG_ID`（单租户模式）。

## 启用认证（仍然独立）

多用户认证使用办公套件内置的每用户凭据存储，以及本地签发的 HS256 会话 JWT——不涉及任何控制平面。

```sh
# config.yaml → auth.enabled: true
export LIWAN_JWT_SECRET="$(openssl rand -hex 32)"   # required when auth is on
./liwan
```

仅用于本地开发时，你也可以设置 `LIWAN_DEV=1`，它会使用一个明确标注为不安全的开发密钥。**切勿在生产环境中设置此项。**

通过 `POST /api/auth/register` 创建第一个用户，然后由管理员账户生成邀请令牌。完整的认证流程参见 `README.md`。

## 集成接口（seam）

办公套件核心与任何外部控制平面之间的边界，是 `backend/seam` 中的一小组 Go 接口：

| 接口                | 独立默认实现（`backend/seam`）                                |
| ------------------- | ------------------------------------------------------------ |
| `seam.Identity`     | `LocalIdentity` — 验证办公套件自身签发的 HS256 会话 JWT       |
| `seam.Entitlements` | `LocalEntitlements` — 无限制 / `self-hosted`，启用全部功能    |
| `seam.Usage`        | `NoopUsage` — 丢弃计量数据（Prometheus 指标仍会导出）         |

组合根（`main.go`）通过 `seam.NewStandaloneProvider(...)` 接入独立默认实现。**核心代码从不导入任何云端代码**，因此即使移除云适配器，独立构建也不会失效。

## 可选：外部控制平面集成

该集成适配器是一个**独立的包**（`backend/integration/cloud`），它针对外部控制平面实现了相同的 `seam` 接口。
**仅当设置了 `VULOS_CP_BASE_URL` 时**才会启用：

```sh
export VULOS_CP_BASE_URL="https://cp.example.org"  # points at your own control plane
export VULOS_CP_TOKEN="<service token>"            # optional outbound auth
export VULOS_ORG_ID="<org id>"                      # tenant scoping (also used by storage)
```

启用后：

- 身份仍在本地验证（办公套件的令牌使用共享密钥进行 HS256 签名），但会附加配置的 `OrgID`。
- 权益从 `GET {CP}/api/entitlements` 获取（在控制平面临时故障时**失败开放**，即放行）。
- 用量事件以“发后即忘”（fire-and-forget）的方式发送至 `POST {CP}/api/usage`。

未设置 `VULOS_CP_BASE_URL`（默认情况）时，上述流程均不会运行，Liwan 完全独立。Vulos 不提供可供你指向的控制平面——此接口仅供希望接入自有控制平面的用户使用。
