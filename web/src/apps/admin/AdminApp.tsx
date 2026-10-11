
/**
 * AdminApp — minimal admin console for the office backend.
 *
 * Two panels:
 *   - Invites: mint single-use / expiring registration invite tokens, list
 *     existing invites (metadata only — the raw token is shown exactly once at
 *     mint time and never re-displayed), and revoke them.
 *   - Audit log: read the append-only security audit (ACL grants/revokes,
 *     registration + invite events, role changes).
 *
 * Every endpoint here requires the admin scope; a non-admin caller gets 403,
 * which this UI surfaces as an inline error.
 *
 * Constraints: JSX never .tsx | reuse design tokens | no dangerouslySetInnerHTML
 * (all values rendered as text to avoid XSS from audit detail fields).
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { api } from '../../lib/api'

interface Invite {
  id: string
  note?: string
  max_uses: number
  used_count: number
  expires_at?: number
  revoked: boolean
}

interface MintedInvite {
  token: string
  invite?: Invite
}

interface AuditEntry {
  id: string
  at?: number
  actor?: string
  action: string
  target?: string
  detail?: string
}

const ACTION_LABELS: Record<string, string> = {
  'acl.grant': '已授予 ACL 权限',
  'acl.revoke': '已撤销 ACL 权限',
  'acl.set_owner': '已设置所有者',
  'auth.register': '已注册',
  'invite.mint': '已生成邀请码',
  'invite.consume': '邀请码已使用',
  'invite.revoke': '邀请码已撤销',
  'role.change': '角色已变更',
}

function fmtTime(unixNanos: number | undefined): string {
  if (!unixNanos) return ''
  const d = new Date(Math.floor(unixNanos / 1e6))
  return d.toLocaleString()
}

function fmtExpiry(unixSeconds: number | undefined): string {
  if (!unixSeconds) return '永不过期'
  return new Date(unixSeconds * 1000).toLocaleString()
}

export default function AdminApp() {
  const [tab, setTab] = useState('invites')
  const [error, setError] = useState('')

  return (
    <div className="flex flex-col h-full bg-bg text-ink">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-line bg-bg-elev2">
        <h1 className="text-lg font-semibold tracking-tight">管理后台</h1>
        <nav className="flex gap-2">
          <TabButton active={tab === 'invites'} onClick={() => setTab('invites')}>
            邀请码
          </TabButton>
          <TabButton active={tab === 'audit'} onClick={() => setTab('audit')}>
            审计日志
          </TabButton>
        </nav>
      </header>
      {error && (
        <div className="mx-6 mt-4 rounded-md bg-danger-bg border border-danger/40 text-danger px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <main className="flex-1 overflow-auto p-6">
        {tab === 'invites' ? (
          <InvitesPanel onError={setError} />
        ) : (
          <AuditPanel onError={setError} />
        )}
      </main>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-3 py-1 rounded-md text-sm font-medium transition-colors duration-fast ' +
        (active ? 'bg-accent text-white' : 'bg-bg-elev2 text-ink-muted hover:bg-bg-hover hover:text-ink')
      }
    >
      {children}
    </button>
  )
}

export function InvitesPanel({ onError }: { onError: (msg: string) => void }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [note, setNote] = useState('')
  const [maxUses, setMaxUses] = useState<number | string>(1)
  const [ttlHours, setTtlHours] = useState<number | string>(168)
  const [minted, setMinted] = useState<MintedInvite | null>(null) // { token, invite } shown once
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const list = await api.adminListInvites() as Invite[]
      setInvites(Array.isArray(list) ? list : [])
    } catch (e) {
      onError(e instanceof Error ? e.message : '加载邀请码失败')
    }
  }, [onError])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const mint = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    onError('')
    try {
      const res = await api.adminMintInvite({
        note,
        maxUses: Number(maxUses) || 1,
        ttlHours: Number(ttlHours) || 0,
      }) as MintedInvite
      setMinted(res)
      setNote('')
      await refresh()
    } catch (err) {
      onError(err instanceof Error ? err.message : '生成邀请码失败')
    } finally {
      setLoading(false)
    }
  }

  const revoke = async (id: string) => {
    onError('')
    try {
      await api.adminRevokeInvite(id)
      await refresh()
    } catch (err) {
      onError(err instanceof Error ? err.message : '撤销邀请码失败')
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void mint(e)} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-4">
        <label className="flex flex-col text-sm">
          <span className="text-ink-muted mb-1.5">备注（如受邀人邮箱）</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-bg-elev2 border border-line rounded-md px-2.5 py-1.5 text-ink"
            placeholder="alice@vulos.org"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="text-ink-muted mb-1.5">最大使用次数</span>
          <input
            type="number"
            min="1"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="bg-bg-elev2 border border-line rounded-md px-2.5 py-1.5 w-24 text-ink"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="text-ink-muted mb-1.5">有效期（小时，0 表示永不过期）</span>
          <input
            type="number"
            min="0"
            value={ttlHours}
            onChange={(e) => setTtlHours(e.target.value)}
            className="bg-bg-elev2 border border-line rounded-md px-2.5 py-1.5 w-32 text-ink"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="bg-accent text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          生成邀请码
        </button>
      </form>

      {minted && (
        <div className="rounded-lg border border-accent-tint-2 bg-accent-tint p-4">
          <p className="text-sm text-accent-press font-medium mb-2">
            邀请码已生成，请立即复制此令牌，之后将不再显示。
          </p>
          <code className="block bg-bg border border-line rounded-md px-2.5 py-1.5 text-sm break-all font-mono text-ink">
            {minted.token}
          </code>
        </div>
      )}

      <table className="w-full text-sm border border-line rounded-lg overflow-hidden">
        <thead className="bg-bg-elev2 text-ink-muted">
          <tr>
            <th className="text-left px-3 py-2">备注</th>
            <th className="text-left px-3 py-2">使用次数</th>
            <th className="text-left px-3 py-2">过期时间</th>
            <th className="text-left px-3 py-2">状态</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {invites.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-ink-faint">
                暂无邀请码。
              </td>
            </tr>
          )}
          {invites.map((inv) => {
            const spent = inv.max_uses > 0 && inv.used_count >= inv.max_uses
            const status = inv.revoked ? '已撤销' : spent ? '已用完' : '有效'
            return (
              <tr key={inv.id} className="border-t border-line">
                <td className="px-3 py-2">{inv.note || '—'}</td>
                <td className="px-3 py-2">
                  {inv.used_count}/{inv.max_uses}
                </td>
                <td className="px-3 py-2">{fmtExpiry(inv.expires_at)}</td>
                <td className="px-3 py-2">{status}</td>
                <td className="px-3 py-2 text-right">
                  {!inv.revoked && (
                    <button
                      type="button"
                      onClick={() => void revoke(inv.id)}
                      className="text-danger hover:underline"
                    >
                      撤销
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function AuditPanel({ onError }: { onError: (msg: string) => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([])

  const refresh = useCallback(async () => {
    try {
      const list = await api.adminListAudit(500) as AuditEntry[]
      setEntries(Array.isArray(list) ? list : [])
    } catch (e) {
      onError(e instanceof Error ? e.message : '加载审计日志失败')
    }
  }, [onError])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-faint">只追加记录，按时间倒序排列。</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-sm text-accent hover:underline"
        >
          刷新
        </button>
      </div>
      <table className="w-full text-sm border border-line rounded-lg overflow-hidden">
        <thead className="bg-bg-elev2 text-ink-muted">
          <tr>
            <th className="text-left px-3 py-2">时间</th>
            <th className="text-left px-3 py-2">操作人</th>
            <th className="text-left px-3 py-2">操作</th>
            <th className="text-left px-3 py-2">目标</th>
            <th className="text-left px-3 py-2">详情</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-ink-faint">
                暂无审计事件。
              </td>
            </tr>
          )}
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-line">
              <td className="px-3 py-2 whitespace-nowrap">{fmtTime(e.at)}</td>
              <td className="px-3 py-2">{e.actor || '—'}</td>
              <td className="px-3 py-2">{ACTION_LABELS[e.action] || e.action}</td>
              <td className="px-3 py-2 break-all">{e.target || '—'}</td>
              <td className="px-3 py-2 break-all text-ink-faint">{e.detail || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
