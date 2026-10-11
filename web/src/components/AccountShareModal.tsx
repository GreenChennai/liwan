/**
 * AccountShareModal — account-based sharing for an Office document.
 *
 * Wires the backend account-share ACL (POST /files/:id/share, GET
 * /files/:id/collaborators, Unshare) to a real, owner-only share UI. This is the
 * NAMED-USER path: you share a document to a specific Vulos account/email and
 * pick their role. It is COMPLEMENTARY to the P2P E2E link path (P2PShareModal),
 * which shares content-blind to anyone holding the link.
 *
 * Role model (matches fileacl on the server):
 *   • viewer    — read only.
 *   • commenter — read + comment (the comment endpoints), but no content edits.
 *   • editor    — read + write content.
 *   • owner     — full control (shown, never granted here — an owner can't be
 *                 demoted through this dialog).
 *
 * Security posture (the server is the source of truth — the UI never grants
 * access on its own):
 *   • Every grant / role-change / revoke is owner-gated server-side. A non-owner
 *     who opens this dialog can view the roster but every write returns 403,
 *     which we surface. We ALSO hide the mutating controls when the caller is not
 *     the owner (defence in depth + honest UI), inferred from the collaborator
 *     roster (owner === me).
 *   • The roster comes from the server and reflects only this file's ACL.
 *
 * A11y: rendered through the shared <Modal>, which provides the focus trap,
 * Escape-to-close, and focus restoration. Controls are keyboard-operable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  UserPlus, Eye, MessageSquare, Pencil, Crown, Trash2, Loader2, Users, Link2,
  Lock, Clock, Copy, Check, KeyRound, ArrowRightLeft, AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal, Button, Input, Avatar, hueFor, useToast } from './ui'
import { api } from '../lib/api'
import { resolveReachableBase, reachableBaseSync } from '../lib/collab/reachableBase.js'

// Minimal shapes of the records the account-share + share-link endpoints
// resolve to — the api module itself returns `unknown` by design (see
// src/lib/api.ts), so this documents just what this component reads.
interface Collaborator {
  account_id: string
  role: string
}
interface CollaboratorsResponse {
  collaborators?: Collaborator[]
}
interface ShareLink {
  id: string
  revoked?: boolean
  has_password?: boolean
  expires_at?: string
}
interface ShareLinksResponse {
  links?: ShareLink[]
}
interface CreatedShareLink {
  id?: string
  token?: string
}

// Expiry presets offered when minting a link (seconds). 0 = never.
const EXPIRY_OPTIONS = [
  { label: '永不过期',  seconds: 0 },
  { label: '1 小时',   seconds: 60 * 60 },
  { label: '1 天',     seconds: 24 * 60 * 60 },
  { label: '7 天',     seconds: 7 * 24 * 60 * 60 },
  { label: '30 天',    seconds: 30 * 24 * 60 * 60 },
]

// Build the absolute anonymous view URL for a link token. Prefers Office's
// externally-reachable base (LIWAN_PUBLIC_URL via /api/reachability) so a
// link handed to an external viewer targets a reachable URL even when the box is
// behind NAT and the owner loaded Office over a LAN address; falls back to the
// current origin (standalone/cloud where the origin is already public).
function shareLinkUrl(token: string) {
  if (typeof window === 'undefined') return `/view/${token}`
  return `${reachableBaseSync()}/view/${token}`
}

// The three grantable roles, in ascending privilege. Owner is intentionally not
// grantable through this dialog.
const ROLES: { value: string; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'viewer',    label: '查看者',    hint: '可查看',              icon: Eye },
  { value: 'commenter', label: '评论者',    hint: '可查看并评论',        icon: MessageSquare },
  { value: 'editor',    label: '编辑者',    hint: '可编辑',              icon: Pencil },
]

function roleMeta(role: string) {
  return ROLES.find((r) => r.value === role) || { value: role, label: role, hint: '', icon: Eye }
}

/**
 * AccountShareModal
 *
 * @param {boolean}  open       whether the dialog is shown.
 * @param {function} onClose    close handler.
 * @param {object}   file       { id, name } of the document being shared.
 * @param {string}   me         the caller's account id (from systemInfo). Used to
 *                              detect ownership and prevent self-share.
 * @param {function} onSwitchToLink optional — invoked when the user chooses the
 *                              complementary "share via link" (P2P E2E) path.
 * @param {string}   liveCollabNotice optional — when live co-editing is turned
 *                              off for this deployment, the honest explanation to
 *                              show here. Sharing still grants access; what it
 *                              does NOT do is stream edits in real time, and this
 *                              is the one dialog where a user would otherwise
 *                              assume it does. Never omit it silently.
 */
interface AccountShareModalProps {
  open: boolean
  onClose: () => void
  file?: { id?: string | undefined; name?: string | undefined } | null
  me?: string | undefined
  onSwitchToLink?: (() => void) | undefined
  liveCollabNotice?: string | null
}

export default function AccountShareModal({ open, onClose, file, me = '', onSwitchToLink, liveCollabNotice = null }: AccountShareModalProps) {
  const { showToast, toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [owner, setOwner] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [busy, setBusy] = useState(false) // an add/change/revoke is in flight
  const [error, setError] = useState('')

  // Callers only mount this dialog against a real file; a missing id would
  // already have failed identically at the fetch layer pre-migration (a
  // `/files/undefined/...` request), so this narrows without changing that.
  const fileId = file?.id as string

  const refresh = useCallback(async () => {
    if (!fileId) return
    setLoading(true)
    setError('')
    try {
      const res = await api.listFileCollaborators(fileId) as CollaboratorsResponse
      const list = res?.collaborators || []
      const own = list.find((c) => c.role === 'owner')
      setOwner(own?.account_id || '')
      // Show non-owner collaborators in the editable roster.
      setCollaborators(list.filter((c) => c.role !== 'owner'))
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法加载协作者')
    } finally {
      setLoading(false)
    }
  }, [fileId])

  useEffect(() => { if (open) void refresh() }, [open, refresh])
  // Warm the reachable-base cache so shareLinkUrl() (a sync render path) can
  // prefer Office's public origin over a LAN-only window.location.origin.
  // resolveReachableBase never rejects (reachableBase.ts falls back to
  // window.location.origin on any failure).
  useEffect(() => { if (open) void resolveReachableBase() }, [open])

  // Ownership drives whether the mutating controls are shown. When the roster
  // records no owner (legacy/local single-user file), treat the caller as the
  // effective owner so local mode keeps working.
  const isOwner = useMemo(() => !owner || owner === me, [owner, me])

  const addCollaborator = async (e?: FormEvent) => {
    e?.preventDefault?.()
    const acct = email.trim()
    if (!acct) return
    if (acct.toLowerCase() === (me || '').toLowerCase() || acct === owner) {
      setError('你已经是此文档的所有者或可以访问此文档。')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.shareFile(fileId, acct, role)
      setEmail('')
      await refresh()
      showToast(`已分享给 ${acct}`, 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法分享')
    } finally {
      setBusy(false)
    }
  }

  const changeRole = async (accountId: string, nextRole: string) => {
    setBusy(true)
    setError('')
    try {
      await api.shareFile(fileId, accountId, nextRole)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法更改角色')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (accountId: string) => {
    setBusy(true)
    setError('')
    try {
      await api.revokeShare(fileId, accountId)
      await refresh()
      showToast(`已移除 ${accountId}`, 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法移除访问权限')
    } finally {
      setBusy(false)
    }
  }

  // Transfer ownership to another account. Owner-only; the server demotes the
  // previous owner to editor. Confirmed before firing.
  const transferOwnership = async (newOwner: string) => {
    setBusy(true)
    setError('')
    try {
      await api.transferOwnership(fileId, newOwner)
      await refresh()
      showToast(`所有权已转移给 ${newOwner}`, 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法转移所有权')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`分享“${file?.name || '文档'}”`} size="lg">
      <Modal.Body className="space-y-4">
        <p className="text-xs text-ink-muted leading-relaxed">
          通过对方的 Vulos 账号或邮箱与其分享此文档。对方使用自己的账号登录，
          并仅获得您授予的访问权限。
        </p>

        {/* Honesty: co-editing is off — say what sharing will and will not do. */}
        {liveCollabNotice && (
          <div
            className="flex items-start gap-2 rounded-md border border-line bg-bg-elev2 px-3 py-2.5"
            data-testid="live-collab-notice"
          >
            <AlertTriangle size={13} className="text-warning mt-0.5 flex-shrink-0" />
            <p className="text-2xs text-ink-muted leading-relaxed">{liveCollabNotice}</p>
          </div>
        )}

        {/* Add a collaborator (owner only) */}
        {isOwner && (
          <form className="flex items-stretch gap-2" onSubmit={(e) => void addCollaborator(e)}>
            <div className="flex-1 min-w-0">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com 或账号 ID"
                aria-label="要分享给的账号或邮箱"
                leading={<UserPlus size={14} />}
                autoFocus
              />
            </div>
            <label className="sr-only" htmlFor="share-role">角色</label>
            <select
              id="share-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-md border border-line bg-paper text-ink text-xs px-2 focus:outline-none focus-visible:shadow-focus"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <Button type="submit" variant="primary" size="sm" disabled={busy || !email.trim()}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              分享
            </Button>
          </form>
        )}

        {error && (
          <p className="text-2xs text-danger bg-danger-bg border border-danger/20 rounded-md px-2.5 py-1.5" role="alert">
            {error}
          </p>
        )}

        {/* People with access */}
        <div className="space-y-1">
          <p className="text-2xs font-semibold text-ink-faint tracking-eyebrow uppercase flex items-center gap-1.5">
            <Users size={11} /> 有访问权限的人员
          </p>
          <div className="rounded-md border border-line divide-y divide-line overflow-hidden">
            {/* Owner row (always shown, never editable) */}
            {owner && (
              <PersonRow
                accountId={owner}
                role="owner"
                isMe={owner === me}
                editable={false}
              />
            )}
            {loading ? (
              <div className="flex items-center gap-2 text-2xs text-ink-faint px-3 py-3 justify-center">
                <Loader2 size={13} className="animate-spin" /> 加载中…
              </div>
            ) : collaborators.length === 0 ? (
              <p className="text-2xs text-ink-faint px-3 py-3 text-center">
                {owner ? '暂无其他人有访问权限。' : '只有你可以访问此文档。'}
              </p>
            ) : (
              collaborators.map((c) => (
                <PersonRow
                  key={c.account_id}
                  accountId={c.account_id}
                  role={c.role}
                  isMe={c.account_id === me}
                  editable={isOwner && !busy}
                  onChangeRole={(r: string) => void changeRole(c.account_id, r)}
                  onRevoke={() => void revoke(c.account_id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Share links + transfer ownership (owner only) */}
        {isOwner && fileId && (
          <>
            <ShareLinksSection fileId={fileId} onError={setError} showToast={showToast} />
            <TransferOwnershipSection
              collaborators={collaborators}
              onTransfer={transferOwnership}
              busy={busy}
            />
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {onSwitchToLink && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { onClose?.(); onSwitchToLink() }}
            className="mr-auto"
          >
            <Link2 size={13} /> 通过链接分享（P2P）
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>完成</Button>
      </Modal.Footer>
      {toast}
    </Modal>
  )
}

// ─── PersonRow ──────────────────────────────────────────────────────────────
interface PersonRowProps {
  accountId: string
  role: string
  isMe: boolean
  editable: boolean
  onChangeRole?: (role: string) => void
  onRevoke?: () => void
}

function PersonRow({ accountId, role, isMe, editable, onChangeRole, onRevoke }: PersonRowProps) {
  const meta = roleMeta(role)
  const RoleIcon = role === 'owner' ? Crown : meta.icon
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <Avatar name={accountId} size={26} color={hueFor(accountId)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-ink truncate tracking-tightish">
          {accountId}{isMe && <span className="text-ink-faint font-normal">（你）</span>}
        </p>
        <p className="text-2xs text-ink-faint flex items-center gap-1">
          <RoleIcon size={10} /> {role === 'owner' ? '所有者' : meta.hint}
        </p>
      </div>
      {role === 'owner' ? (
        <span className="text-2xs text-ink-faint px-2 py-1 flex items-center gap-1">
          <Crown size={11} className="text-warning" /> 所有者
        </span>
      ) : editable ? (
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor={`role-${accountId}`}>{accountId} 的角色</label>
          <select
            id={`role-${accountId}`}
            value={role}
            onChange={(e) => onChangeRole?.(e.target.value)}
            className="rounded-md border border-line bg-paper text-ink text-2xs px-1.5 py-1 focus:outline-none focus-visible:shadow-focus"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={onRevoke}
            aria-label={`移除 ${accountId}`}
            className="p-1 rounded-sm text-ink-faint hover:text-danger hover:bg-danger-bg transition-colors focus:outline-none focus-visible:shadow-focus"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ) : (
        <span className="text-2xs text-ink-faint px-2 py-1 flex items-center gap-1 capitalize">
          <meta.icon size={11} /> {meta.label}
        </span>
      )}
    </div>
  )
}

// ─── ShareLinksSection ───────────────────────────────────────────────────────
// Owner-only: mint expiring / password-protected read-only links, list them,
// and revoke. Access is granted by the server on the anonymous view route — the
// UI never conveys access itself.
//
// SHOWN ONCE. The server stores only a SHA-256 of each link token, so
// GET /files/:id/share-links returns no token for any link — not even one
// minted a second ago. A URL is therefore copyable only while the mint response
// that carried it is still in this component's state: `mintedUrls` below, keyed
// by link id and never persisted. Reopen the modal and the URL is gone.
//
// This is a deliberate, visible trade. Previously the store held live tokens, so
// anyone who could read it held working links; now nobody can re-derive a URL,
// including the owner. Links already in circulation keep working — the server
// hashes what the visitor presents — and revoke works from the link id, so the
// owner never needs the token to kill a leaked link. The list says all of this
// rather than rendering a dead or empty URL.
interface ShareLinksSectionProps {
  fileId: string
  onError: (msg: string) => void
  showToast?: (msg: string, kind?: 'info' | 'success' | 'error') => void
}

function ShareLinksSection({ fileId, onError, showToast }: ShareLinksSectionProps) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
  const [minting, setMinting] = useState(false)
  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  // { [linkId]: absoluteUrl } — populated only by mint(), only for this modal
  // session. Never written to storage: it is the one copy of a live capability.
  const [mintedUrls, setMintedUrls] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.listShareLinks(fileId) as ShareLinksResponse
      setLinks(res?.links || [])
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '无法加载链接')
    } finally {
      setLoading(false)
    }
  }, [fileId, onError])

  useEffect(() => { void refresh() }, [refresh])

  const mint = async () => {
    setMinting(true)
    onError?.('')
    try {
      const created = await api.createShareLink(fileId, { password: password.trim(), expiresInSeconds: expiry }) as CreatedShareLink
      // The mint response is the ONLY time the server hands over the token.
      // Hold the built URL here so the owner can copy it before the modal
      // closes; after that it is unrecoverable by design.
      if (created?.id && created?.token) {
        const id = created.id
        const token = created.token
        setMintedUrls((m) => ({ ...m, [id]: shareLinkUrl(token) }))
      }
      setPassword('')
      setExpiry(0)
      await refresh()
      showToast?.('链接已创建——请立即复制，该 URL 仅显示一次', 'success')
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '无法创建链接')
    } finally {
      setMinting(false)
    }
  }

  const revoke = async (linkId: string) => {
    onError?.('')
    try {
      await api.revokeShareLink(fileId, linkId)
      await refresh()
      showToast?.('链接已撤销', 'success')
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '无法撤销链接')
    }
  }

  const copy = async (link: ShareLink) => {
    const url = mintedUrls[link.id]
    if (!url) return // no URL to copy; the button is not rendered in that case
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(link.id)
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      // Clipboard blocked — surface the URL so the user can copy manually.
      showToast?.(url, 'success')
    }
  }

  const active = links.filter((l) => !l.revoked)

  return (
    <div className="space-y-2 pt-2 border-t border-line">
      <p className="text-2xs font-semibold text-ink-faint tracking-eyebrow uppercase flex items-center gap-1.5">
        <Link2 size={11} /> 知道链接的人（仅只读）
      </p>

      {/* Mint controls */}
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex-1 min-w-[9rem]">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码（可选）"
            aria-label="链接密码（可选）"
            leading={<KeyRound size={13} />}
          />
        </div>
        <label className="sr-only" htmlFor="link-expiry">链接有效期</label>
        <select
          id="link-expiry"
          value={expiry}
          onChange={(e) => setExpiry(Number(e.target.value))}
          className="rounded-md border border-line bg-paper text-ink text-xs px-2 focus:outline-none focus-visible:shadow-focus"
        >
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.seconds} value={o.seconds}>{o.label}</option>
          ))}
        </select>
        <Button variant="secondary" size="sm" onClick={() => void mint()} disabled={minting}>
          {minting ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
          创建链接
        </Button>
      </div>

      {/* Existing links */}
      {loading ? (
        <div className="flex items-center gap-2 text-2xs text-ink-faint px-1 py-1">
          <Loader2 size={12} className="animate-spin" /> 正在加载链接…
        </div>
      ) : active.length === 0 ? (
        <p className="text-2xs text-ink-faint px-1">没有有效的链接。</p>
      ) : (
        <ul className="rounded-md border border-line divide-y divide-line overflow-hidden">
          {active.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <Link2 size={12} className="text-ink-faint flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {mintedUrls[l.id] ? (
                  <p className="text-2xs text-ink truncate font-mono">{mintedUrls[l.id]}</p>
                ) : (
                  // Say what happened. An empty line, or a URL built from an
                  // absent token, would read as a bug or — worse — get pasted.
                  <p className="text-2xs text-ink-faint italic">
                    仅在创建时显示 URL——此链接仍然有效，但无法再次读取
                  </p>
                )}
                <p className="text-2xs text-ink-faint flex items-center gap-2 mt-px">
                  {l.has_password && <span className="flex items-center gap-0.5"><Lock size={9} /> 需要密码</span>}
                  {l.expires_at
                    ? <span className="flex items-center gap-0.5"><Clock size={9} /> 有效期至 {new Date(l.expires_at).toLocaleDateString()}</span>
                    : <span className="flex items-center gap-0.5"><Clock size={9} /> 永不过期</span>}
                </p>
              </div>
              {mintedUrls[l.id] && (
                <button
                  onClick={() => void copy(l)}
                  aria-label="复制链接 URL"
                  title="复制链接"
                  className="p-1 rounded-sm text-ink-faint hover:text-accent hover:bg-accent-tint focus:outline-none focus-visible:shadow-focus"
                >
                  {copiedId === l.id ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              )}
              <button
                onClick={() => void revoke(l.id)}
                aria-label="撤销链接"
                title="撤销链接"
                className="p-1 rounded-sm text-ink-faint hover:text-danger hover:bg-danger-bg focus:outline-none focus-visible:shadow-focus"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── TransferOwnershipSection ────────────────────────────────────────────────
// Owner-only: hand full ownership to an existing collaborator (or any account),
// with an explicit confirm. The server demotes the previous owner to editor.
interface TransferOwnershipSectionProps {
  collaborators: Collaborator[]
  onTransfer: (newOwner: string) => void | Promise<void>
  busy: boolean
}

function TransferOwnershipSection({ collaborators, onTransfer, busy }: TransferOwnershipSectionProps) {
  const [target, setTarget] = useState('')
  const [confirming, setConfirming] = useState(false)

  const submit = () => {
    const acct = target.trim()
    if (!acct) return
    setConfirming(true)
  }

  const doTransfer = async () => {
    setConfirming(false)
    await onTransfer(target.trim())
    setTarget('')
  }

  return (
    <div className="space-y-2 pt-2 border-t border-line">
      <p className="text-2xs font-semibold text-ink-faint tracking-eyebrow uppercase flex items-center gap-1.5">
        <ArrowRightLeft size={11} /> 转移所有权
      </p>
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0">
          <Input
            list="transfer-collab-list"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="新所有者（账号或邮箱）"
            aria-label="新所有者账号"
            leading={<Crown size={13} />}
          />
          <datalist id="transfer-collab-list">
            {(collaborators || []).map((c) => (
              <option key={c.account_id} value={c.account_id} />
            ))}
          </datalist>
        </div>
        <Button variant="secondary" size="sm" onClick={submit} disabled={busy || !target.trim()}>
          <ArrowRightLeft size={13} /> 转移
        </Button>
      </div>
      <p className="text-2xs text-ink-faint">
        除非您主动移除自己，否则您将被降级为编辑者并保留访问权限。
      </p>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="确定转移所有权？" size="sm">
        <Modal.Body>
          <p className="text-sm text-ink-muted leading-relaxed">
            <span className="text-ink font-medium">{target}</span> 将成为此文档的唯一
            所有者。您将保留编辑者权限。除非新所有者再将所有权转回，否则此操作无法撤销。
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="md" onClick={() => setConfirming(false)}>取消</Button>
          <Button variant="primary" size="md" onClick={() => void doTransfer()}>
            <ArrowRightLeft size={13} /> 转移所有权
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
