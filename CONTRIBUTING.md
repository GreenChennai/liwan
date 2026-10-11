# 为 Liwan 贡献代码

## 行为准则

我们遵循 [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)。

## 开发环境搭建

要求：Go 1.22+，Node 20+

```bash
# Backend
cd backend && go build ./...
go test ./...

# Frontend
npm install
npm run dev
```

对于 PDF 签名组件，请确保 `pdftk` 或同等的纯 Go 签名库可用（参见 `backend/signing/`）。

## 分支与 PR 约定

- 从 `main` 分支创建新分支。命名规则：`feat/description`、`fix/description`、`chore/description`。
- 每个 PR 只包含一个逻辑变更，保持差异（diff）易于审阅。
- PR 需要至少一位审阅者批准。
- 推荐使用 Squash 合并。

## 提交信息风格

欢迎但不强制使用 Conventional Commits 规范：

```
feat(crdt): add undo/redo stack to fabric
fix(signing): handle multi-page PDF with form fields
chore: bump automerge to 2.x
```

## 测试要求

提交 PR 之前，请运行：

```bash
go test ./...
go vet ./...
npm run lint
npm test
```

CRDT 冲突解决逻辑非常微妙——在可行的情况下，新增的 CRDT 路径需要配套基于属性（property-based）或模糊（fuzz）测试。

## 如何找到适合新手的任务

可以关注带有 `good first issue` 或 `help wanted` 标签的 Issue。UI 打磨、无障碍（accessibility）和文档是门槛较低的入门切入点。

## 范围：我们接受与拒绝的内容

### 接受

- 缺陷修复与安全改进
- CRDT 正确性与收敛性改进（文档协作）
- PDF 签名的健壮性（边缘情况的文档）
- 日历 / 通讯录的可靠性与互操作性（`.ics` / vCard）
- 无障碍改进
- 测试与文档

### 拒绝 — 冻结的不变量

- **Go 代码中不使用 CGO**。仅使用纯 Go。
- **不使用 .tsx 文件**。前端仅使用 JSX（`*.jsx`）。
- **不接受 Google SSO / OAuth** 登录流程。
- **不接入 Stripe 计费**。
- **不做 Rust 重写**——全部使用 Go。
- 需要 Liwan 自身 P2P 对等网络结构之外基础设施的实时协作功能，应放在 Vulos OS 仓库（github.com/vul-os/vulos）中，而非本仓库。
- 引入新的运行时依赖之前，须先在 Issue 中讨论。

## 许可

Liwan 采用 MIT 许可。贡献内容同样适用 MIT 许可。无需签署 CLA。
