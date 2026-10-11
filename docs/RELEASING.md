# Liwan – 版本与发布策略

## 版本号

采用语义化版本（Semver，`vX.Y.Z`）。当前处于 **v0.x**。

v1.0 的条件：签名 API 与 CRDT 线路格式趋于稳定。

## 标签格式

在 `main` 上打 `vX.Y.Z` 标签。发布分支：`release/X.Y`。

## 提交约定

采用 Conventional Commits。破坏性的 CRDT 线路格式变更需要在页脚添加 `BREAKING CHANGE:`。

## 签名产物

```sh
cosign sign-blob --key release.key liwan-linux-amd64 > liwan-linux-amd64.sig
git tag -s v0.3.1 -m "Release v0.3.1"
```

## CHANGELOG

仓库根目录下的 `CHANGELOG.md`。采用 Conventional Commits 格式。
