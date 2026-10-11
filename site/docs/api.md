# Liwan — 公共 `/v1` API

这是一套简洁的、仅使用 JSON 的 REST API，构建于 Liwan 文档引擎（Docs、Sheets、Slides）之上。它对外暴露的是 Web 应用所使用的同一套文档存储、按文件访问控制以及导出服务，只是封装在稳定、带版本号、面向开发者的接口之后。

约定（参照 mail 连接器的 `/v1` API——lilmail）：

- **JSON 进，JSON 出。** 请求和响应体均为 `application/json`（导出端点返回二进制办公文件——见下文）。
- **不重定向。** 认证失败时返回 JSON 格式的 `401`/`403`/`503`，绝不会重定向到 HTML 登录页。
- **错误**统一为 `{"error": "<message>"}` 结构。
- **按所有者范围限定。** 每个请求都会解析为一个已验证的账户，并经过按文件 ACL 的过滤。对于你无权查看的文档，访问被拒绝时返回 `404`（不泄露文档是否存在），而不是 `403`。

基础路径：`/v1`。所有示例均假定主机为 `http://localhost:8080`（独立部署的默认值）。

---

## 认证

`/v1` API 接受以下两种凭据**之一**，均通过 `Authorization` 头传递：

### 1. 会话（现有的 Liwan 登录）

`Authorization: Bearer <session-jwt>`，**或** HttpOnly 的 `session` cookie（HS256，与 Web 应用使用的令牌相同）。这是面向自有应用/自托管场景的零配置路径。

当 Liwan 以 `auth.enabled: false`（单用户自托管）运行时，无需任何凭据，请求将以本地 `self` 身份执行。

### 2. API 密钥（`vk_…`）

`Authorization: Bearer vk_live_…`

API 密钥是以 `vk_` 为前缀的不透明令牌。它会通过**密钥内省接缝**（见下文）在已配置的控制平面（"CP"）上进行验证——Vulos 不运营任何控制平面；此处指向的是你自己运行的控制平面（如果你有的话）。密钥必须有效**且**具备 `office` 产品范围。

只有在配置了 CP 基础 URL（`VULOS_CP_BASE_URL`）时，API 密钥路径才会启用。未配置时，密钥路径被禁用，`/v1` 仅接受会话认证——自托管的行为保持不变。

`vk_` 令牌永远不会被当作会话 JWT 尝试，反之亦然：`vk_` 前缀决定使用哪种认证方案，因此二者不会混淆。

| 情形 | 响应 |
| ------------------------------------------- | --------------------------------------------------- |
| 无会话或会话无效（已启用认证） | `401 {"error":"authentication required"}` |
| `vk_` 密钥无效 / 已吊销 / 已过期 | `401 {"error":"invalid API key"}` |
| `vk_` 密钥有效但缺少 `office` 产品 | `403 {"error":"API key not authorized for the office product"}` |
| 内省时 CP 不可达 | `503 {"error":"API key validation unavailable"}` |

API 密钥只能以其所属账户的身份行事——它们永远不携带租户级的管理员范围。

---

## 密钥内省接缝（控制平面契约）

这是 Vulos 产品（Liwan、Mail、Talk 等）可以针对自配置的控制平面以完全相同的方式实现的**共享**接缝契约，用于验证 `vk_` 密钥：**一个**端点，每个产品的调用方式都相同。

### 请求

```http
POST {VULOS_CP_BASE_URL}/api/keys/introspect
Content-Type: application/json
X-Relay-Auth: <VULOS_CP_TOKEN>        # 服务认证（可选；未设置时省略）

{ "key": "vk_live_abc123…" }
```

### 响应（成功查询时始终返回 `200`）

```json
{
  "valid":    true,
  "account":  "alice@vulos.org",
  "scopes":   ["documents.read", "documents.write"],
  "products": ["office", "mail"]
}
```

对于未知 / 已吊销 / 已过期的密钥，CP 仍返回 `200`，内容为：

```json
{ "valid": false }
```

| 字段 | 类型 | 含义 |
| ---------- | ---------- | ----------------------------------------------------------------- |
| `valid` | bool | 该密钥当前是否可用。 |
| `account` | string | 所属账户 id（成为请求的已验证身份）。 |
| `scopes` | string[] | 密钥携带的细粒度范围（仅供参考；见下文）。 |
| `products` | string[] | 密钥可以使用的产品。Liwan 要求其中包含 `"office"`。 |

### 调用方行为（由每个产品实现）

- 结果会按密钥的哈希值在进程内**缓存约 60 秒**，因此一阵 API 调用中，同一密钥每分钟最多只会被内省一次。
- 非 `200` 响应或传输错误均按**故障即关闭（fail-closed）**处理：请求以 `503` 拒绝，而不是放行。
- Liwan 要求 `products` 中包含 `office`。`scopes` 被返回以供未来使用（按端点的范围执行）；目前任何有效的 `office` 密钥都可以在其自身的 ACL 范围内使用每个 `/v1` 端点。

### 配置

| 环境变量 | 用途 |
| -------------------- | ------------------------------------------------------------------ |
| `VULOS_CP_BASE_URL` | 控制平面基础 URL（例如 `https://cp.example.org`，指向你自己的控制平面——Vulos 不运营任何控制平面）。启用 `vk_` 路径。未设置 → 仅会话认证。 |
| `VULOS_CP_TOKEN` | 在内省调用中以 `X-Relay-Auth` 发送的服务令牌。可选。 |

这些与可选的控制平面权益接缝所使用的是**同一组**环境变量，因此附加了控制平面的部署只需配置一次。

---

## 文档端点

*文档（document）*指的是 Docs / Sheets / Slides 文件。`type` 取值为 `doc`、`sheet`、`slide` 之一（`pdf` 为将来导入 PDF 文档保留）。

文档元数据对象：

```json
{
  "id": "0b3f…",
  "name": "Q3 Plan",
  "type": "doc",
  "created_at": "2026-06-28T10:11:12Z",
  "updated_at": "2026-06-28T10:30:00Z"
}
```

### `GET /v1/documents`

列出调用者可访问的文档（自有的 + 共享给他的；管理员可见全部）。

查询参数：

| 参数 | 说明 |
| ------ | ------------------------------------------------- |
| `type` | 可选过滤：`doc`、`sheet`、`slide`、`pdf`。 |

```json
200 OK
{ "documents": [ { "id": "…", "name": "…", "type": "doc", … } ] }
```

### `GET /v1/documents/:id`

获取单个文档的元数据。

```json
200 OK
{ "id": "…", "name": "…", "type": "doc", "created_at": "…", "updated_at": "…" }
```

如果文档不存在或你无权访问，返回 `404 {"error":"document not found"}`。

### `POST /v1/documents`

创建文档。

```json
POST /v1/documents
{ "name": "Q3 Plan", "type": "doc", "content": { … } }
```

`name` 与 `type` 为必填项；`content` 为可选的初始正文（任意 JSON 值——即编辑器的原生文档模型）。创建者账户将成为所有者，因此文档默认是私有的。

```json
201 Created
{ "id": "…", "name": "Q3 Plan", "type": "doc", … }
```

### `PATCH /v1/documents/:id`

重命名和/或替换内容。所有字段均为可选；仅应用提供的字段。

```json
PATCH /v1/documents/:id
{ "name": "Q3 Plan (final)", "content": { … } }
```

```json
200 OK
{ "id": "…", "name": "Q3 Plan (final)", "type": "doc", … }
```

> 注意："移动"（文件夹/组织）被建模为元数据补丁；目前文档在每个账户下是扁平的，因此 `name` 是唯一可变的元数据。

### `DELETE /v1/documents/:id`

删除文档（及其 ACL 状态）。

```json
200 OK
{ "deleted": true, "id": "…" }
```

---

## 内容与导出

### `GET /v1/documents/:id/content`

获取文档正文，或将其导出。

- **不带 `format`** → 以 JSON 形式返回原始存储的正文：

  ```json
  200 OK
  { "id": "…", "type": "doc", "content": { … } }
  ```

- **`?format=<fmt>`** → 以 `attachment` 下载形式返回导出的二进制文件。可用格式取决于文档类型：

  | 类型 | 格式 | 包含内容 |
  | ------- | -------------- | --------------------------------------------------------------- |
  | `doc` | `pdf`、`docx` | 文本、标题、列表、**表格**、**嵌入图片**。 |
  | `sheet` | `xlsx` | 单元格、样式、合并单元格、公式、**真实图表**（与单元格关联）。 |
  | `slide` | `pdf`、`pptx` | `pptx`：**带位置的文本框、图片和形状**。`pdf`：仅文本。 |

### `POST /v1/documents/:id/export`

将文档渲染为办公格式并返回二进制附件。这是标准的导出端点。

```json
POST /v1/documents/:id/export
{ "format": "docx" }
```

```http
200 OK
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="Q3 Plan.docx"
<binary>
```

文档类型不支持该格式 → `400 {"error":"unsupported format…"}`。

### 导出保真度——导出绝不会悄无声息地丢失你的数据

每个导出响应都会携带其自身的保真度信息，因为二进制附件中没有可以放置警告的正文：

| 响应头 | 取值 |
| ------------------- | ---------------------------------------------------------------- |
| `X-Export-Fidelity` | `full`——文档中的所有内容都已包含在文件中。 |
| | `degraded`——有内容无法携带。参见警告。 |
| `X-Export-Warnings` | 由通俗英文字符串组成的 JSON 数组。仅在 degraded 时出现。 |

```http
200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="Q3.xlsx"
X-Export-Fidelity: degraded
X-Export-Warnings: ["Chart \"Funnel\" was NOT embedded in the .xlsx (no Excel equivalent); its definition is preserved in the hidden \"Vulos Charts\" sheet, so re-importing this file into Vulos restores it."]
<binary>
```

关心保真度的客户端应检查 `X-Export-Fidelity` 并展示警告；不关心的客户端可以忽略这两个响应头。**`full` 是一项承诺**——如果某条路径无法携带某些内容，它会明确说明，而不是悄悄返回一个不完整的文件。

目前会报告的情况：

- **`sheet` → `xlsx`。** 图表会以真实的、与单元格关联的 OOXML 图表形式嵌入（柱形/条形/堆叠/100%、折线、面积、组合图（包括次坐标轴）、饼图、环形图、散点图、气泡图、直方图）。没有 Excel 对应物的图表类型，或其数据范围无法解析的图表，都会被报告——但其定义仍保存在隐藏的 `Vulos Charts` 工作表中，因此将该文件重新导入 Vulos 即可完整恢复。**直方图**以带有说明的方式嵌入（其分箱在导出时计算并写入单元格；Excel 不会重新分箱）。**实时数据透视表**不会被导出，并会被报告。
- **`doc` → `docx` / `pdf`。** 表格和图片会被嵌入。**远程**（`http(s)`）图片**不会被抓取**——服务器不会发出文档指示它发出的请求——并会被报告；只有嵌入在文档中的图片（`data:` 形式的 PNG/JPEG/GIF/WebP）会被保留。公式以其 LaTeX 源码导出。在 PDF 中，表格单元格内的图片以其替代文本（alt text）显示。
- **`slide` → `pptx`。** 文本框、图片和形状会以其真实位置、尺寸和旋转角度导出。远程图片不会被抓取（会被报告）；演讲者备注不包含在内（会被报告）。
- **`slide` → `pdf`。** 文本流渲染器：图片和形状不会被绘制，其丢失会被报告。若要保留它们，请导出为 `pptx`。

---

## 协作者（共享管理）

### `GET /v1/documents/:id/collaborators`

列出文档所有者以及该文档共享给的账户。

```json
200 OK
{ "owner": "alice@vulos.org", "collaborators": ["bob@vulos.org"] }
```

### `POST /v1/documents/:id/collaborators`

授予或撤销其他账户的访问权限。与第一方应用使用同一套 ACL 存储和仅追加的审计日志。

```json
POST /v1/documents/:id/collaborators
{ "account": "bob@vulos.org", "revoke": false }
```

```json
200 OK
{ "ok": true }
```

设置 `"revoke": true` 可移除访问权限。

---

## 状态码

| 代码 | 含义 |
| ---- | ------------------------------------------------------------------- |
| 200 | 成功 |
| 201 | 已创建（POST /v1/documents） |
| 400 | 请求体格式错误 / 不支持的导出格式 |
| 401 | 凭据缺失或无效 |
| 402 | 权益/配额门控（超出配额 / 套餐不包含办公产品） |
| 403 | API 密钥无权使用 `office` 产品 |
| 404 | 文档不存在或无权访问 |
| 429 | 请求频率受限（写入端点；令牌桶） |
| 500 | 内部错误 |
| 503 | API 密钥验证不可用（控制平面不可达） |

写入端点（`POST`/`PATCH`/`DELETE`）受按 IP 的令牌桶限流（默认突发 30，每秒补充 10 个），与其余写入接口共享该限额。
