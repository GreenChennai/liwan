# Liwan — 静态部署指南

Liwan 会发布 `office` 单页应用（SPA），使用 Vite 构建，并上传至 Tigris 对象存储以通过 CDN 分发。

> Liwan 是**仅包含文档类功能**的产品（文档、表格、幻灯片、PDF/签名）。日历和通讯录来自自带邮箱的 PIM 连接器（**lilmail**），由 OS 以独立组件的形式呈现——而非来自 Liwan。聊天与视频则是第三方服务（Matrix/Element；Element Call / Jitsi），而不是 Vulos 产品。**Vulos OS** 是承载这些应用的外壳。

## 前置条件

- AWS CLI v2（通过 S3 兼容 API 上传至 Tigris）
- Node.js 20+ 与 npm（用于 Vite 构建）

## 凭据

| 变量 | 说明 |
|---|---|
| `TIGRIS_ACCESS_KEY_ID` | Tigris 访问密钥 |
| `TIGRIS_SECRET_ACCESS_KEY` | Tigris 私有密钥 |
| `TIGRIS_BUCKET` | 存储桶名称（例如 `liwan-static`） |
| `TIGRIS_ENDPOINT` | 可选；默认为 `https://fly.storage.tigris.dev` |

## 用法

部署所有目标：
```sh
./scripts/deploy-static.sh
```

仅部署单个目标：
```sh
./scripts/deploy-static.sh office
```

部署并写入 `latest` 指针，以便 CDN 路由能够解析当前的 SHA：
```sh
./scripts/deploy-static.sh office --latest
./scripts/deploy-static.sh all --latest
```

## CDN 地址

每次部署都会上传到存储桶中的 `<target>/<sha>/`，并通过 Tigris 静态托管提供服务：

| 目标 | 访问路径 | 存储桶路径 |
|---|---|---|
| office | `app.vulos.org/office/` | `office/<sha>/` |

静态文件通过 Vulos 应用中心（`app.vulos.org`，由 Tigris 提供支持，在你的 `fly.toml` 或 DNS CNAME 中配置）提供服务。应用通过应用中心下的**路径**访问——不存在按产品划分的子域名，符合标准的 vulos-naming-and-urls URL 规范。

## SPA 回退

所有目标都是依赖 HTML5 History API 的单页应用。请配置你的 Fly.io `fly.toml` 或静态服务器，使其对所有未匹配的路径返回 `index.html`：

```toml
[[http_service]]
  # ...

[[http_service.checks]]
  # ...

# Serve SPA index.html for all unmatched paths.
[http_service.static]
  fallback = "index.html"
```

## `--latest` 标志的工作原理

使用 `--latest` 时，脚本会将已部署的 SHA 以纯文本对象的形式写入存储桶中的 `<target>/latest`。你的 CDN 路由或 Fly 代理可以读取该文件来解析当前部署版本，而无需列出完整目录。

## Tigris 与应用中心（`app.vulos.org`）

静态资源上传至 Tigris（`fly.storage.tigris.dev`），并通过 Vulos 应用中心（`app.vulos.org`）提供服务。Tigris 存储桶必须启用公开静态服务。存储桶配置参见 [Tigris 文档](https://www.tigrisdata.com/docs/objects/static-website/)。
