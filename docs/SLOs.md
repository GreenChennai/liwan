# Liwan – 服务等级目标（SLO）

| # | 服务面 | 目标 | 度量方式 | 错误预算（99.9% / 月） | 回滚触发条件 |
|---|---------|--------|-------------|------------------------------|------------------|
| 1 | **WebSocket 信令 p95** | CRDT 操作往返 < 100 ms | 追踪 span `crdt.sync` | 43.2 分钟/月 | p95 > 200 ms 持续 5 分钟 → 暂停发布 |
| 2 | **文件 API p95** | < 300 ms（GET /api/files/:id） | `liwan_request_duration_seconds` 的 p95 | 43.2 分钟/月 | p95 > 600 ms 持续 5 分钟 → 告警 |
| 3 | **签署工作流 p99** | 从 POST /sign/:envelope/send 起 < 2 s | 追踪 span `signing.send` | 43.2 分钟/月 | p99 > 5 s → 告警 |
| 4 | **API 错误率** | < 0.5% | `liwan_error_count_total / liwan_request_count_total` | 26 分钟/月 | 错误率 > 2% 持续 2 分钟 → 暂停发布 + 告警 |
| 5 | **可用性** | 99.5% | 每 60 秒探测 HTTP `/api/auth/status` | 3.6 小时/月 | 连续 3 次失败 → 重启 + 告警 |
| 6 | **CRDT 合并耗时** | 1 000 操作的文档 < 50 ms | 追踪 span `crdt.merge` | 仅供参考 | 合并 p95 > 200 ms → 告警；在下次发布前排查 |

## 说明

- WebSocket 信令 SLO 仅覆盖服务端的扇出路径；客户端往返时延不计入。
- 签署 SLO 覆盖服务端的信封创建 + 邮件派发启动。
- CRDT 合并仅作参考；合并耗时过长表明存在建模问题，需要排查，而不是回滚。
