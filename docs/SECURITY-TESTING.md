# 安全测试 — Liwan

本文档描述 `liwan` 后端（Go）以及文档/幻灯片 HTML 渲染路径（JSX/vitest）的**渗透/对抗测试套件**。

> Liwan 是仅包含文档的产品。聊天和视频由第三方提供（Matrix/Element；Element Call / Jitsi），并非 Vulos 产品；本文档仅涵盖 Liwan 自身的攻击面。

这些套件采用攻击者视角编写：每个测试都**尝试一次具体的攻击，并断言其被阻止**。运行全部通过，意味着相应的防御措施有效。如果其中任何一个测试变红，应将其视为**正在存在的漏洞**，而不是不稳定的测试。

## 运行方法

Go（后端）渗透测试：

```bash
cd liwan

# 仅运行渗透测试套件（详细输出）：
CGO_ENABLED=0 go test ./backend/... -run 'Pentest' -v

# 或运行整个后端测试套件（包括渗透测试和单元测试）：
CGO_ENABLED=0 go build ./... && CGO_ENABLED=0 go vet ./... && CGO_ENABLED=0 go test ./...
```

前端（HTML 渲染 / 净化器）渗透测试：

```bash
cd liwan
npx vitest run src/apps/slides/sanitize.test.js
# 或完整的 vitest 套件：
npm test
```

## 测试文件位置

| 文件 | 层级 | 攻击类别 |
|------|-------|----------------|
| `backend/middleware/pentest_token_test.go` | 认证中间件 | 1（认证/令牌），2（中间件层的身份） |
| `backend/handlers/pentest_files_test.go` | 文件处理器 | 2（身份伪造），3（文件 IDOR），6（CSRF/环境权限） |
| `backend/handlers/pentest_authorid_test.go` | 评论/作者绑定 | 2（作者 id 伪造） |
| `backend/handlers/pentest_envelopes_test.go` | 签署信封 | 3（信封/签署人授权） |
| `backend/handlers/pentest_localfiles_test.go` | 本地文件服务 | 3（路径穿越） |
| `backend/handlers/pentest_creds_test.go` | 认证/凭据 | 5（每用户凭据） |
| `backend/handlers/pentest_helpers_test.go` / `pentest_storage_test.go` | 测试框架 | （辅助） |
| `backend/handlers/sharelink_sec_test.go` | 分享链接查看路由 | 3（凭令牌进行写入提权），7（暴力破解 / 存在性探测） |
| `backend/handlers/sharelink_token_once_test.go` | 分享链接管理 API | 7（静态凭据：任何端点都不得重新输出链接令牌） |
| `backend/storage/local_sharelinks_hash_test.go` / `postgres_sharelinks_test.go` | 分享链接持久化 | 7（静态凭据：任何后端都不得以明文存储令牌） |
| `src/apps/slides/sanitize.test.js` | JSX 渲染路径 | 4（XSS） |

这些测试是对先前已有的专项测试的补充（而非替代）：`backend/middleware/auth_test.go`、`backend/handlers/files_authz_test.go`、`backend/handlers/auth_creds_test.go` 以及 `src/apps/slides/sanitize.test.js`。

## 威胁覆盖（攻击类别）

### 1. 认证 / 令牌伪造（`pentest_token_test.go`）
- 使用**错误密钥**签名的伪造 JWT → 401。
- **alg=none**（未签名）令牌 → 401（阻止算法混淆）。
- 提交给 HS256 验证器的 **RS256** 令牌 → 401（中间件将签名方法固定为 `*SigningMethodHMAC`）。
- **已过期**的令牌（签名有效）→ 401。
- **被篡改**的负载（签名不再匹配）→ 401。
- 受保护路由上**缺失**令牌 → 401。
- 乱码的 bearer 值 → 401。
- **开发密钥门控**：配置了真实密钥时，已知的开发密钥会被拒绝；在**没有密钥且未开启开发模式**时，验证器会**失败即关闭（503）**——它绝不会悄悄接受开发密钥。

### 2. 身份伪造（`pentest_token_test.go`、`pentest_files_test.go`、`pentest_authorid_test.go`）
- 伪造的 `X-Account-ID` 头**不会**改变非管理员的操作身份；身份仅取自已验证 JWT 的 `sub`。
- 通过 `X-Account-ID` 进行的管理员冒充，取决于**已验证的管理员范围**（`vulos:admin` audience），而不仅仅是头部是否存在。
- 评论/回复中伪造的作者 id 会被拒绝——作者身份绑定于已验证的身份，而非请求体。

### 3. 文件 IDOR / ACL（`pentest_files_test.go`、`pentest_envelopes_test.go`、`pentest_localfiles_test.go`）
每个面向文件的处理器都会执行按文件的 ACL（`backend/fileacl`），它们都共享进程级的 `SharedFileAuthz`。渗透测试证明：非所有者无法从被拒绝的 `GET /files/:id` 转而访问同级的开放端点：
- 非所有者的 Get/Update/Delete/**export**/**comment**/**version** → **404**（不泄露存在性——拒绝与“未找到”一致）。
- `List` 仅返回调用者可访问的文件（无跨租户泄露）。
- 显式**共享**会授予被授权者在各个次级处理器上的访问权限；未共享的**第三方仍然被拒绝**。
- 非所有者**无法自行共享**受害者的文件以获得访问权限。
- 管理员按设计绕过 ACL。
- 签署信封与签署人端点限定于文档所有者 / 限定范围的签署人令牌；本地文件服务路径会拒绝 `..` 穿越。

### 4. XSS（`src/apps/slides/sanitize.test.js`）
针对文档/幻灯片的 HTML 渲染管线（DOMPurify `sanitize()` → `dangerouslySetInnerHTML`），使用恶意内容进行测试（`<script>`、`<img onerror>`、`<svg onload>`、`<iframe>`、`javascript:` / `vbscript:` URL、autofocus/ontoggle 处理器）。断言是 **DOM 级别**的：没有可执行元素存活，且没有元素带有 `on*` 处理器或 `javascript:`/`vbscript:` URL 属性。

### 5. 每用户凭据（`pentest_creds_test.go`，以及 `auth_creds_test.go`）
- 一旦某用户完成注册，旧版**共享密码**就无法再对该账户进行认证（自断言身份漏洞保持关闭）。
- 密码错误 → 被拒绝。
- **无用户枚举探测点**：不存在的账户与密码错误都返回相同的 `ErrInvalidCredential`；存储还会执行一次虚拟的 bcrypt 比较，以使耗时大致恒定。
- 空密码永远无法通过认证。
- 注册校验：重复注册被拒绝（防止账户被接管）；少于 8 个字符的密码被拒绝。

### 6. CSRF / 方法（`pentest_files_test.go`）
Office API 由 **bearer/JWT 驱动**：每个处理器都只信任从已验证令牌（`Authorization: Bearer` 或显式令牌）派生出的上下文身份。跨站请求无法附加 `Authorization` 头，因此在 bearer 路径上，经典 CSRF **不适用**。会话 **cookie** 路径通过 `HttpOnly` + `SameSite=Lax` 进行缓解（参见 `backend/handlers/auth.go` 的 `Login`），且令牌永远不会在响应体中返回。该渗透测试证明系统**不存在环境权限**：一个不携带已验证令牌的状态变更请求（仅携带伪造的 `X-Account-ID`），会被归属到本地 `self` 身份，而**绝不会**归属到攻击者指定的账户。

### 7. 静态凭据（`sharelink_token_once_test.go`、`local_sharelinks_hash_test.go`、`postgres_sharelinks_test.go`）

分享链接令牌是一种 bearer 能力：持有即拥有访问权。它过去以**明文**形式存储——作为 `data/sharelinks/<token>.json` 的文件名以及其中的 `token` 字段，在 Postgres 中则存储于 `share_links.token`——因此，对存储的读取权限就等于对这些链接所指向的每一份文档的读取权限。`backend/invites` 从一开始就采用了正确的设计（对原始令牌做 SHA-256，原始令牌仅在创建时展示一次）；现在分享链接也与之保持一致。

上述测试直接断言了“不应存在”的部分：明文不出现在磁盘字节或数据库列中；任何后端的任何读取路径都不能返回令牌；管理端点根本不输出 `token` 键；将存储的哈希提交给查看路由也不会打开文档。上一版本写入的记录会在首次使用时就地转换，对此也有相应测试——一个已存在的链接停止工作，与一个泄露的链接同样是缺陷。

## 发现的问题

已修复一项问题：分享链接令牌以明文存储（见上文第 7 类）。本套件中的其他内容在编写测试时就已被阻止。如果你新增了面向文件、签署人或管理员范围的端点，请在发布前为相应的渗透测试套件补充一个负面测试；如果你新增了 bearer 凭据，请存储其哈希，而不是凭据本身。
