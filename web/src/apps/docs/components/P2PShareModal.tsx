// no-broker-dep:allow-file: the unavailable-P2P message below names Pier once, as one of
// several options a user is told about (account-based sharing, a Vulos OS/Pier host, or any
// self-hosted relayd) — rendered UI copy, no fetch/import/default endpoint.
/**
 * P2PShareModal — "Share → collaborate via link (P2P)" (WAVE-25).
 *
 * The invite-flow UI for Liwan's secure local/P2P collaboration mode.
 * Generates rw/ro invite links for a document. Opening one of these links (route
 * /docs/collab#vp2p=…) joins the room; this modal is only the SHARER side.
 *
 * Security posture surfaced to the user (honestly):
 *   • The link contains the room key IN THE FRAGMENT — anyone it is forwarded to
 *     can join with that capability. We say so.
 *   • The relay never sees the doc: content is end-to-end encrypted under the key
 *     in the link. We say so.
 *   • To revoke, mint a new link (rotate the room key). We offer a "New room" btn.
 *
 * Availability posture (also honest): a standalone Office binary never mounts
 * `/api/peering/*` — links minted here would look real but never connect
 * anyone, UNLESS this deployment has a rendezvous URL configured
 * (config.yaml `collab.rendezvous_url` / VULOS_RENDEZVOUS_URL), in which case
 * the session runs against that relayd directly with no host box at all (see
 * transportSelection.js, docs/COLLABORATION.md §3). useP2PCollab's
 * startShare() resolves the three-way transport BEFORE minting a room and,
 * only when NEITHER is reachable, rejects instead of resolving with links —
 * so callers pass `unavailable` here rather than leaving this modal stuck on
 * "Preparing room…" forever (the previous behaviour when startShare's error
 * was simply swallowed by the caller).
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link2, Copy, Check, Eye, Pencil, Shield, RefreshCw, AlertTriangle } from 'lucide-react'
import { Modal, Button } from '../../../components/ui'

export interface P2PShareLinks {
  rwLink: string
  roLink: string
}

export interface P2PShareModalProps {
  open: boolean
  onClose?: () => void
  links: P2PShareLinks | null
  onRotate?: () => void
  /** useP2PCollab's `roomId` state — `string | null` (never omitted, never
   *  `undefined`), same as `links` above; both lanes pass it straight through. */
  roomId: string | null
  unavailable?: boolean
}

type CopiedWhich = 'rw' | 'ro' | null

export default function P2PShareModal({ open, onClose, links, onRotate, roomId, unavailable = false }: P2PShareModalProps) {
  const [copied, setCopied] = useState<CopiedWhich>(null)

  const copy = async (which: CopiedWhich, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(which)
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1600)
    } catch {
      // Clipboard denied (insecure context / permissions) — select fallback.
      setCopied(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="通过链接协作（P2P）" size="lg">
      <Modal.Body className="space-y-4">
        <p className="text-xs text-ink-muted leading-relaxed">
          分享链接即可以点对点方式共同编辑此文档——无需云账号或服务器。编辑内容直接在浏览器之间同步，
          并且<strong className="text-ink">端到端加密</strong>：中继只转发密文，无法读取文档内容。
        </p>

        {unavailable ? (
          <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 px-3 py-2.5">
            <AlertTriangle size={13} className="text-danger mt-0.5 flex-shrink-0" />
            <div className="text-2xs text-ink leading-relaxed space-y-1">
              <p className="font-medium">本服务器不支持 P2P 协同。</p>
              <p className="text-ink-faint">
                这是独立部署的 Office——它不提供邀请链接连接节点所需的对等网络组件
                (<code>/api/peering/*</code>)，也未配置会合服务地址。请改用基于账号的分享，
                或将 Office 部署在 Vulos OS / Pier 主机之后；也可以（无需操作系统或账号）将本部署指向任意自建
                relayd 的会合服务地址——参见 docs/CONFIGURATION.md。
              </p>
            </div>
          </div>
        ) : !links ? (
          <div className="flex items-center gap-2 text-xs text-ink-faint py-6 justify-center">
            <RefreshCw size={14} className="animate-spin" />
            正在准备房间…
          </div>
        ) : (
          <>
            <LinkRow
              icon={<Pencil size={13} />}
              label="编辑链接"
              hint="可阅读和编辑"
              value={links.rwLink}
              copied={copied === 'rw'}
              onCopy={() => void copy('rw', links.rwLink)}
              tone="accent"
            />
            <LinkRow
              icon={<Eye size={13} />}
              label="仅查看链接"
              hint="可阅读实时编辑内容，但无法修改文档"
              value={links.roLink}
              copied={copied === 'ro'}
              onCopy={() => void copy('ro', links.roLink)}
              tone="muted"
            />

            <div className="flex items-start gap-2 rounded-md bg-bg-elev2 border border-line px-3 py-2.5">
              <Shield size={13} className="text-ink-faint mt-0.5 flex-shrink-0" />
              <div className="text-2xs text-ink-faint leading-relaxed space-y-1">
                <p>
                  任何拿到链接的人都可以凭此加入，请像对待密钥一样妥善保管链接。
                  如需撤销访问权限，请新建房间，旧链接将随即失效。
                </p>
                {roomId && (
                  <p className="font-mono opacity-70">房间 {roomId.slice(0, 12)}…</p>
                )}
              </div>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {links && onRotate && (
          <Button variant="ghost" size="sm" onClick={onRotate}>
            <RefreshCw size={13} /> 新建房间
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>完成</Button>
      </Modal.Footer>
    </Modal>
  )
}

interface LinkRowProps {
  icon: ReactNode
  label: string
  hint: string
  value: string
  copied: boolean
  onCopy: () => void
  tone: 'accent' | 'muted'
}

function LinkRow({ icon, label, hint, value, copied, onCopy, tone }: LinkRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
        <span className={tone === 'accent' ? 'text-accent-press' : 'text-ink-muted'}>{icon}</span>
        {label}
        <span className="text-2xs font-normal text-ink-faint">— {hint}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 rounded-md border border-line bg-bg-elev2 px-2.5 py-1.5">
          <Link2 size={12} className="text-ink-faint flex-shrink-0" />
          <input
            readOnly
            value={value}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 bg-transparent text-2xs font-mono text-ink-muted outline-none"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={onCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
    </div>
  )
}
