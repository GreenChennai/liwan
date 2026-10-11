import { useEffect, useState, useCallback } from 'react'
import {
  FileSignature, Clock, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, Bell, Trash2, ChevronDown, ChevronUp, Users,
  Download, ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Card, IconButton, Tooltip, LoadingState } from './ui'

// OFFICE-45: Envelope Dashboard — per-envelope progress panel.
// Lists all signing envelopes with signer-level status, sequential/parallel
// mode badge, and action buttons: remind, cancel.
//
// Aesthetic direction — warm paper, single accent, warm signal hues
// (sage/honey/persimmon) for status; quiet horizontal progress bar; expandable
// per-signer rows with serif name + email.

// ─── Local shapes — `api` returns `unknown` by design; these document just
// what this panel reads. ────────────────────────────────────────────────────
interface Signer {
  id: string
  name?: string
  email?: string
  order?: number
  status: string
}
interface EnvelopeStatus {
  signers: Signer[]
}
interface Envelope {
  id: string
  title: string
  status: string
  order_mode?: string
}
interface VerifyResult {
  ok: boolean
  hash_error?: string
  chain_error?: string
  signers?: unknown[]
}
interface RemindResponse {
  reminded?: string[]
}

const STATUS_META: Record<string, { label: string; tone: string; icon: LucideIcon }> = {
  draft:     { label: '草稿',     tone: 'neutral', icon: Clock },
  sent:      { label: '已发送',      tone: 'info',    icon: Clock },
  completed: { label: '已完成',  tone: 'success', icon: CheckCircle2 },
  declined:  { label: '已拒绝',  tone: 'danger',  icon: XCircle },
  voided:    { label: '已作废',    tone: 'warning', icon: AlertCircle },
}

const TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-bg-elev2 text-ink-muted',
  info:    'bg-info-bg text-info',
  success: 'bg-success-bg text-success',
  danger:  'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
}

const SIGNER_STATUS_META: Record<string, { label: string; dot: string }> = {
  pending:  { label: '待签署',  dot: 'bg-line-strong' },
  sent:     { label: '已发送',     dot: 'bg-info' },
  viewed:   { label: '已查看',   dot: 'bg-warning' },
  signed:   { label: '已签署',   dot: 'bg-success' },
  declined: { label: '已拒绝', dot: 'bg-danger' },
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || STATUS_META.draft
  const Icon = meta.icon
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-2xs font-semibold tracking-tightish',
        TONE_CLASSES[meta.tone],
      ].join(' ')}
    >
      <Icon size={11} />
      {meta.label}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="w-full h-1 rounded-pill bg-bg-elev2 overflow-hidden">
      <div
        className="h-full bg-accent transition-[width] duration-slow ease-spring"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function SignerRow({ signer }: { signer: Signer }) {
  const meta = SIGNER_STATUS_META[signer.status] || SIGNER_STATUS_META.pending
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
      <span className="font-serif italic text-sm text-ink flex-1 truncate">
        {signer.name || signer.email}
        {signer.email && signer.name && (
          <span className="ml-1.5 text-2xs text-ink-faint not-italic font-sans">
            {signer.email}
          </span>
        )}
      </span>
      <span className="text-2xs text-ink-faint tracking-tightish">
        #{signer.order}
      </span>
      <span className="text-2xs font-medium text-ink-muted tracking-tightish w-16 text-right">
        {meta.label}
      </span>
    </div>
  )
}

interface EnvelopeRowProps {
  envelope: Envelope
  onRemind: (envelopeId: string) => void
  onCancel: (envelopeId: string) => void
  onRefresh: () => void
}

function EnvelopeRow({ envelope, onRemind, onCancel, onRefresh }: EnvelopeRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState<EnvelopeStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.envelopeStatus(envelope.id) as EnvelopeStatus
      setStatus(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载状态失败')
    } finally {
      setLoading(false)
    }
  }, [envelope.id])

  const onVerify = useCallback(async () => {
    setVerifyLoading(true)
    setVerifyError(null)
    setVerifyResult(null)
    if (!expanded) setExpanded(true)
    try {
      const data = await api.verifyEnvelope(envelope.id) as VerifyResult
      setVerifyResult(data)
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : '验证失败')
    } finally {
      setVerifyLoading(false)
    }
  }, [envelope.id, expanded])

  useEffect(() => {
    if (expanded && !status) void loadStatus()
  }, [expanded, status, loadStatus])

  const active = envelope.status !== 'completed'
    && envelope.status !== 'voided'
    && envelope.status !== 'declined'

  // Quiet per-envelope progress: count signed signers if status loaded;
  // else fall back to a heuristic from the envelope's own status.
  let progressPct = 0
  if (status?.signers?.length) {
    const total = status.signers.length
    const done = status.signers.filter(s => s.status === 'signed').length
    progressPct = (done / total) * 100
  } else if (envelope.status === 'completed') {
    progressPct = 100
  } else if (envelope.status === 'sent') {
    progressPct = 8 // a faint indication of "in flight"
  }

  return (
    <Card className="overflow-hidden transition-colors duration-fast ease-out">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-bg-elev2 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <FileSignature size={15} className="text-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink truncate text-sm tracking-tightish">
              {envelope.title}
            </span>
            <span
              className={[
                'text-2xs px-1.5 py-0.5 rounded-xs font-medium tracking-tightish',
                envelope.order_mode === 'sequential'
                  ? 'bg-accent-tint text-accent-press'
                  : 'bg-bg-elev2 text-ink-muted',
              ].join(' ')}
            >
              {envelope.order_mode === 'sequential' ? 'Sequential' : 'Parallel'}
            </span>
          </div>
          <div className="mt-2 max-w-xs">
            <ProgressBar value={progressPct} />
          </div>
        </div>

        <StatusBadge status={envelope.status} />

        <div className="flex items-center gap-0.5 ml-1" onClick={e => e.stopPropagation()}>
          {active && (
            <>
              <Tooltip label="发送提醒">
                <IconButton
                  size="sm"
                  onClick={() => onRemind(envelope.id)}
                  className="hover:bg-warning-bg hover:text-warning"
                >
                  <Bell size={13} />
                </IconButton>
              </Tooltip>
              <Tooltip label="撤销信封">
                <IconButton
                  size="sm"
                  onClick={() => onCancel(envelope.id)}
                  className="hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 size={13} />
                </IconButton>
              </Tooltip>
            </>
          )}
          {envelope.status === 'completed' && (
            <>
              <Tooltip label="下载密封 PDF">
                {/* anchor styled like IconButton — sm size h-7 w-7 */}
                <a
                  href={api.sealedPDFUrl(envelope.id)}
                  download={`sealed-${envelope.id}.pdf`}
                  className="inline-flex items-center justify-center shrink-0 h-7 w-7 rounded-md text-ink-muted transition-[background,color] duration-fast ease-out hover:bg-success-bg hover:text-success"
                  title="下载密封 PDF"
                  aria-label="下载密封 PDF"
                >
                  <Download size={13} />
                </a>
              </Tooltip>
              <Tooltip label="校验文档完整性">
                <IconButton
                  size="sm"
                  onClick={() => void onVerify()}
                  className="hover:bg-accent-tint hover:text-accent"
                >
                  <ShieldCheck size={13} />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Tooltip label="刷新">
            <IconButton
              size="sm"
              onClick={() => { void loadStatus(); onRefresh() }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </IconButton>
          </Tooltip>
          {expanded
            ? <ChevronUp size={14} className="text-ink-faint" />
            : <ChevronDown size={14} className="text-ink-faint" />}
        </div>
      </div>

      {/* Expanded signer list + verify panel */}
      {expanded && (
        <div className="border-t border-line px-4 py-3 bg-bg-elev2 animate-fade-in">
          {loading && (
            <LoadingState size="sm" label="正在加载签署人…" className="py-2" />
          )}
          {error && (
            <p className="text-2xs text-danger py-1">{error}</p>
          )}
          {status && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-2xs text-ink-faint tracking-eyebrow uppercase font-semibold">
                <Users size={11} />
                <span>
                  {status.signers.length} signer{status.signers.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-line">
                {status.signers.map(sg => (
                  <SignerRow key={sg.id} signer={sg} />
                ))}
              </div>
            </div>
          )}
          {!loading && !status && !error && (
            <p className="text-2xs text-ink-faint font-serif italic">
              No signer data — click refresh.
            </p>
          )}

          {/* Verify panel — shown inline after clicking ShieldCheck */}
          {verifyResult && (
            <div className="mt-3 pt-3 border-t border-line">
              <div className={[
                'flex items-start gap-2 px-3 py-2 rounded-sm text-xs',
                verifyResult.ok
                  ? 'bg-success-bg text-success'
                  : 'bg-danger-bg text-danger',
              ].join(' ')}>
                <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold tracking-tightish">
                    {verifyResult.ok ? '文档已验证，所有检查均已通过。' : '验证失败。'}
                  </span>
                  {!verifyResult.ok && (
                    <div className="mt-1 space-y-0.5 text-2xs opacity-80">
                      {verifyResult.hash_error && <div>Hash: {verifyResult.hash_error}</div>}
                      {verifyResult.chain_error && <div>Chain: {verifyResult.chain_error}</div>}
                    </div>
                  )}
                  {verifyResult.ok && verifyResult.signers && verifyResult.signers.length > 0 && (
                    <div className="mt-1 text-2xs opacity-80">
                      {verifyResult.signers.length} signer{verifyResult.signers.length !== 1 ? 's' : ''} verified
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {verifyLoading && (
            <p className="mt-3 text-2xs text-ink-faint font-serif italic">校验中…</p>
          )}
          {verifyError && (
            <p className="mt-3 text-2xs text-danger">{verifyError}</p>
          )}
        </div>
      )}
    </Card>
  )
}

interface Toast {
  msg: string
  type: 'info' | 'success' | 'error'
}

export default function EnvelopeDashboard() {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const loadEnvelopes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listEnvelopes() as Envelope[]
      setEnvelopes(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载信封失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadEnvelopes() }, [loadEnvelopes])

  const handleRemind = useCallback(async (envelopeId: string) => {
    try {
      const res = await api.envelopeRemind(envelopeId) as RemindResponse
      const reminded = res.reminded || []
      showToast(`已向 ${reminded.length} 位签署人发送提醒。`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '发送提醒失败', 'error')
    }
  }, [showToast])

  const handleCancel = useCallback(async (envelopeId: string) => {
    if (!window.confirm('确定撤销（作废）此信封？此操作无法撤销。')) return
    try {
      await api.envelopeCancel(envelopeId)
      showToast('信封已作废。', 'success')
      void loadEnvelopes()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '撤销信封失败', 'error')
    }
  }, [showToast, loadEnvelopes])

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Toast — quiet, paper-on-ink */}
      {toast && (
        <div
          className={[
            'fixed top-4 right-4 z-50 px-4 py-2 rounded-md shadow-e2 text-xs font-medium tracking-tightish animate-fade-in',
            toast.type === 'success' ? 'bg-success text-white'
              : toast.type === 'error' ? 'bg-danger text-white'
              : 'bg-ink text-paper',
          ].join(' ')}
        >
          {toast.msg}
        </div>
      )}

      <header className="mb-6">
        <p className="text-2xs font-semibold text-ink-faint tracking-eyebrow uppercase mb-1">
          签署
        </p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl text-ink tracking-tightish flex items-center gap-2.5">
            信封
          </h1>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadEnvelopes()}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
        </div>
      </header>

      {loading && (
        <LoadingState label="正在加载信封…" className="py-12" />
      )}

      {error && (
        <div className="text-sm text-danger bg-danger-bg border border-line rounded-md px-4 py-3 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && envelopes.length === 0 && (
        <div className="text-center py-20">
          <FileSignature size={36} className="mx-auto mb-3 text-ink-faint opacity-50" />
          <p className="font-serif italic text-ink-muted">
            暂无签署信封。
          </p>
        </div>
      )}

      {!loading && !error && envelopes.length > 0 && (
        <div className="space-y-2">
          {envelopes.map(env => (
            <EnvelopeRow
              key={env.id}
              envelope={env}
              onRemind={(id) => void handleRemind(id)}
              onCancel={(id) => void handleCancel(id)}
              onRefresh={() => void loadEnvelopes()}
            />
          ))}
        </div>
      )}
    </div>
  )
}
