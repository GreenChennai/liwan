/**
 * Settings — the standalone self-hoster's control surface.
 *
 * Everything here is server-honest: it reads live facts from GET /api/system/info
 * (version, storage backend + data dir, auth mode, registered-user count,
 * standalone-vs-cloud integration mode, and the caller's admin status) rather
 * than hardcoding values. Sections:
 *
 *   Account      identity nameplate (editable display name), account id, mode,
 *                version, sign-out.
 *   Appearance   theme (light/dark/auto) + editor preferences.
 *   Security     auth mode (honest), self-service password change when per-user
 *                credentials exist; clear guidance otherwise.
 *   Storage      real backend (local/postgres), data + uploads dirs, object
 *                store (MinIO/S3/Tigris) status, and how to configure each.
 *   Admin        (admin only) invite tokens + audit log — the single-user
 *                self-hoster IS the admin, so this is folded into Settings.
 */

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Save, Shield, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2,
  Sun, Moon, Monitor, HardDrive, Server, Cloud, KeyRound,
  Database, Lock, LogOut, Folder, Boxes,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/api'
import { Button, IconButton, Input, Card, Tabs, Tooltip, useToast } from './ui'
import { useTheme } from './ui/useTheme'
import { InvitesPanel, AuditPanel } from '../apps/admin/AdminApp.jsx'

// ─── Local shape — `api.systemInfo` returns `unknown` by design; this
// documents just what this page reads. ─────────────────────────────────────
interface SystemInfo {
  account_id?: string
  version?: string
  is_admin?: boolean
  integration_mode?: string
  auth?: {
    mode?: string
    user_count?: number
  }
  storage?: {
    backend?: string
    data_dir?: string
    uploads_dir?: string
    object_store?: {
      active?: boolean
      kind?: string
      endpoint?: string
      bucket?: string
    }
  }
}

// ─── Row ─────────────────────────────────────────────────────────────────────
interface RowProps {
  label: string
  hint?: string
  children?: ReactNode
  stacked?: boolean
}

function Row({ label, hint, children, stacked }: RowProps) {
  return (
    <div className={[
      'px-5 py-4 gap-x-6 gap-y-3',
      stacked ? 'flex flex-col' : 'flex items-center justify-between flex-wrap',
    ].join(' ')}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink tracking-tightish">{label}</p>
        {hint && <p className="text-2xs text-ink-faint mt-0.5 leading-snug max-w-md">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ─── Toggle ──────────────────────────────────────────────────────────────────
interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}

function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 items-center rounded-pill transition-colors duration-base ease-out',
        'focus-visible:outline-none focus-visible:shadow-focus',
        checked ? 'bg-accent' : 'bg-line-strong',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-3.5 w-3.5 rounded-pill bg-white shadow-e1 transition-transform duration-base ease-spring',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        ].join(' ')}
      />
    </button>
  )
}

// ─── Segmented control ───────────────────────────────────────────────────────
interface SegmentedOption {
  value: string
  Icon?: LucideIcon
  label: string
}
interface SegmentedProps {
  value: string
  onChange: (v: string) => void
  options: SegmentedOption[]
}

function Segmented({ value, onChange, options }: SegmentedProps) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-bg-elev2 border border-line rounded-md">
      {options.map(({ value: v, Icon, label }) => {
        const active = value === v
        return (
          <Tooltip key={v} label={label} side="bottom">
            <button
              onClick={() => onChange(v)}
              aria-pressed={active}
              className={[
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm text-xs font-medium capitalize',
                'tracking-tightish transition-[background,color] duration-fast ease-out',
                active ? 'bg-paper text-ink shadow-e1' : 'text-ink-faint hover:text-ink-muted',
              ].join(' ')}
            >
              {Icon && <Icon size={13} />}
              {label}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}

// ─── ThemePicker ─────────────────────────────────────────────────────────────
function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <Segmented
      value={theme}
      onChange={setTheme}
      options={[
        { value: 'light',  Icon: Sun,     label: '浅色' },
        { value: 'dark',   Icon: Moon,    label: '深色' },
        { value: 'system', Icon: Monitor, label: '跟随系统' },
      ]}
    />
  )
}

// ─── Mono key/value chip ─────────────────────────────────────────────────────
function Code({ children }: { children?: ReactNode }) {
  return (
    <code className="text-2xs font-mono bg-bg-elev2 text-ink-muted border border-line px-2.5 py-1 rounded-md break-all">
      {children}
    </code>
  )
}

interface PillProps {
  tone?: 'ok' | 'neutral' | 'info'
  Icon?: LucideIcon
  children?: ReactNode
}

function Pill({ tone = 'neutral', Icon, children }: PillProps) {
  const tones: Record<string, string> = {
    ok:      'text-success bg-success-bg border-success',
    neutral: 'text-ink-faint bg-bg-elev2 border-line',
    info:    'text-accent-press bg-accent-tint border-accent-tint-2',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1 rounded-pill border tracking-tightish ${tones[tone]}`}>
      {Icon && <Icon size={11} />}{children}
    </span>
  )
}

// ─── Section header inside a card ────────────────────────────────────────────
function SectionLabel({ Icon, children }: { Icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-4 pb-1">
      {Icon && <Icon size={13} className="text-ink-faint" />}
      <span className="mono-label">{children}</span>
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const { status, logout } = useAuthStore()
  const { showToast, toast } = useToast()

  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [tab, setTab] = useState('account')

  useEffect(() => {
    let live = true
    api.systemInfo()
      .then(d => { if (live) setInfo(d as SystemInfo) })
      .catch(() => { if (live) setInfo(null) })
      .finally(() => { if (live) setInfoLoading(false) })
    return () => { live = false }
  }, [])

  // ── App preferences (localStorage) ──────────────────────────────────────────
  const [autosaveDelay, setAutosaveDelay] = useState(() =>
    parseInt(localStorage.getItem('vulos_autosave_delay') ?? '2000'))
  const [spellcheck, setSpellcheck] = useState(() =>
    localStorage.getItem('vulos_spellcheck') !== 'false')
  const [defaultView, setDefaultView] = useState(() =>
    localStorage.getItem('vulos_default_view') ?? 'grid')

  const savePrefs = () => {
    localStorage.setItem('vulos_autosave_delay', String(autosaveDelay))
    localStorage.setItem('vulos_spellcheck', String(spellcheck))
    localStorage.setItem('vulos_default_view', defaultView)
    showToast('偏好设置已保存')
  }

  // ── Identity (local display name) ───────────────────────────────────────────
  interface Identity {
    displayName: string
    accountId: string
  }
  const readIdentity = (): Identity => {
    try {
      const p = JSON.parse(localStorage.getItem('presence_identity') || '{}') as Partial<Identity>
      if (p?.displayName) return p as Identity
    } catch { /* ignore */ }
    return { displayName: '你', accountId: '' }
  }
  const [identity, setIdentity] = useState<Identity>(readIdentity)
  const [nameDraft, setNameDraft] = useState(identity.displayName)
  const accountId = info?.account_id && info.account_id !== 'self' ? info.account_id : identity.accountId

  const saveName = () => {
    const next = { ...identity, displayName: nameDraft.trim() || '你' }
    setIdentity(next)
    try { localStorage.setItem('presence_identity', JSON.stringify(next)) } catch { /* ignore */ }
    showToast('显示名称已更新')
  }

  // ── Password change (per-user store) ────────────────────────────────────────
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [savingPw, setSavingPw] = useState(false)

  const changePassword = async () => {
    if (!newPw || newPw !== confirmPw) {
      showToast('两次输入的新密码不一致', 'error'); return
    }
    setSavingPw(true)
    try {
      await api.changePassword(curPw, newPw)
      setCurPw(''); setNewPw(''); setConfirmPw('')
      showToast('密码已更新')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '密码更新失败', 'error')
    } finally {
      setSavingPw(false)
    }
  }

  const authMode = info?.auth?.mode // 'disabled' | 'shared' | 'per-user'
  const isAdmin = !!info?.is_admin

  const TABS = [
    { value: 'account',    label: '账号' },
    { value: 'appearance', label: '外观' },
    { value: 'security',   label: '安全' },
    { value: 'storage',    label: '存储' },
    ...(isAdmin ? [{ value: 'admin', label: '管理后台' }] : []),
  ]

  return (
    <div className="flex-1 overflow-auto bg-bg">
      {/* ── Topbar ── */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-5 h-11 bg-paper border-b border-line">
        <Tooltip label="返回" side="bottom">
          <IconButton size="sm" onClick={() => void navigate(-1)}><ArrowLeft size={15} /></IconButton>
        </Tooltip>
        <h1 className="text-sm font-semibold text-ink tracking-tightish flex-1">设置</h1>
        <ThemePicker />
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* ── Account nameplate ── */}
        <div className="flex items-center gap-4 px-5 py-4 bg-paper border border-line rounded-lg">
          <div className="w-11 h-11 rounded-full bg-accent-tint border border-accent flex items-center justify-center flex-shrink-0">
            <span className="text-base font-semibold text-accent-press select-none">
              {(identity.displayName || 'Y').slice(0, 1).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-lg text-ink leading-tight truncate">{identity.displayName}</p>
            <p className="text-2xs text-ink-faint tracking-tightish mt-0.5 truncate">
              {accountId || '本地账号'}
            </p>
          </div>
          {!infoLoading && info && (
            <Pill tone="info" Icon={info.integration_mode === 'cloud' ? Cloud : Server}>
              {info.integration_mode === 'cloud' ? '已连接云端' : '自托管'}
            </Pill>
          )}
        </div>

        {/* ── Tabs ── */}
        <Card>
          <Tabs value={tab} onChange={setTab} items={TABS} />

          {/* ════ ACCOUNT ════ */}
          {tab === 'account' && (
            <div>
              <Row label="显示名称" hint="用于在线状态、评论和你的光标旁的显示。仅保存在本设备。">
                <div className="flex items-center gap-2">
                  <Input value={nameDraft} onChange={e => setNameDraft(e.target.value)} size="sm" className="w-44" placeholder="请输入你的名称" />
                  <Button variant="secondary" size="sm" onClick={saveName} disabled={nameDraft.trim() === identity.displayName}>
                    <Save size={13} /> 保存
                  </Button>
                </div>
              </Row>
              <div className="border-t border-line">
                <Row label="账号 ID" hint="你在本服务器上经过验证的登录身份。">
                  <Code>{accountId || '本机（单用户）'}</Code>
                </Row>
              </div>
              <div className="border-t border-line">
                <Row label="版本" hint="此实例正在运行的构建版本。">
                  <Code>{infoLoading ? '…' : (info?.version || '未知')}</Code>
                </Row>
              </div>
              {status?.enabled && (
                <div className="border-t border-line px-5 py-3 flex justify-end bg-bg-elev2">
                  <Button variant="destructive" size="sm" onClick={() => { void logout() }}>
                    <LogOut size={13} /> 退出登录
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ════ APPEARANCE ════ */}
          {tab === 'appearance' && (
            <div>
              <Row label="主题" hint="浅色、深色，或跟随操作系统设置。">
                <ThemePicker />
              </Row>
              <div className="border-t border-line">
                <Row label="自动保存延迟" hint="停止输入后多久自动保存更改。">
                  <select
                    value={autosaveDelay}
                    onChange={e => setAutosaveDelay(Number(e.target.value))}
                    className="h-8 text-sm text-ink bg-paper border border-line rounded-md px-3 transition-[border-color,box-shadow] duration-fast ease-out focus:outline-none focus:border-accent focus:shadow-focus tracking-tightish"
                  >
                    <option value={1000}>1 秒</option>
                    <option value={2000}>2 秒</option>
                    <option value={3000}>3 秒</option>
                    <option value={5000}>5 秒</option>
                  </select>
                </Row>
              </div>
              <div className="border-t border-line">
                <Row label="拼写检查" hint="在文档编辑器中启用浏览器拼写检查。">
                  <Toggle checked={spellcheck} onChange={setSpellcheck} label="拼写检查" />
                </Row>
              </div>
              <div className="border-t border-line">
                <Row label="默认文件视图" hint="应用首页默认使用网格或列表视图。">
                  <Segmented
                    value={defaultView}
                    onChange={setDefaultView}
                    options={[{ value: 'grid', label: '网格' }, { value: 'list', label: '列表' }]}
                  />
                </Row>
              </div>
              <div className="border-t border-line px-5 py-3 flex justify-end bg-bg-elev2">
                <Button variant="primary" size="sm" onClick={savePrefs}>
                  <Save size={13} /> 保存偏好设置
                </Button>
              </div>
            </div>
          )}

          {/* ════ SECURITY ════ */}
          {tab === 'security' && (
            <div>
              <Row label="身份验证" hint="此服务器如何控制访问。在 config.yaml 中配置。">
                {infoLoading ? (
                  <Loader2 size={14} className="animate-spin text-ink-faint" />
                ) : authMode === 'disabled' ? (
                  <Pill tone="neutral" Icon={AlertCircle}>已禁用</Pill>
                ) : authMode === 'per-user' ? (
                  <Pill tone="ok" Icon={CheckCircle2}>独立账号</Pill>
                ) : (
                  <Pill tone="ok" Icon={Lock}>共享密码</Pill>
                )}
              </Row>

              {!infoLoading && authMode === 'per-user' && typeof info?.auth?.user_count === 'number' && (
                <div className="border-t border-line">
                  <Row label="已注册账号" hint="在此实例上拥有独立凭据的用户。">
                    <Code>{info.auth.user_count}</Code>
                  </Row>
                </div>
              )}

              {/* Per-user: working self-service password change */}
              {!infoLoading && authMode === 'per-user' && (
                <>
                  <SectionLabel Icon={KeyRound}>修改密码</SectionLabel>
                  <div className="px-5 pb-4 pt-1 space-y-2.5">
                    <Input
                      type={showPw ? 'text' : 'password'} value={curPw}
                      onChange={e => setCurPw(e.target.value)} placeholder="当前密码" size="sm"
                    />
                    <Input
                      type={showPw ? 'text' : 'password'} value={newPw}
                      onChange={e => setNewPw(e.target.value)} placeholder="新密码（至少 10 个字符）" size="sm"
                      trailing={
                        <button type="button" onClick={() => setShowPw(v => !v)} className="text-ink-faint hover:text-ink transition-colors">
                          {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      }
                    />
                    <Input
                      type={showPw ? 'text' : 'password'} value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)} placeholder="确认新密码" size="sm"
                    />
                    <div className="flex justify-end pt-1">
                      <Button variant="primary" size="sm" onClick={() => void changePassword()}
                        disabled={!curPw || !newPw || savingPw}>
                        {savingPw ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        更新密码
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Shared / disabled: honest guidance */}
              {!infoLoading && authMode === 'shared' && (
                <div className="border-t border-line px-5 py-4">
                  <p className="text-2xs text-ink-faint leading-relaxed">
                    此实例使用 <Code>config.yaml</Code> 中设置的单一共享密码（<code className="font-mono">auth.password</code>）。
                    请在该文件中修改后重启服务器。若要启用独立账号和自助修改密码，请先注册账号，然后在“管理后台”标签页中生成邀请。
                  </p>
                </div>
              )}
              {!infoLoading && authMode === 'disabled' && (
                <div className="border-t border-line px-5 py-4">
                  <p className="text-2xs text-ink-faint leading-relaxed">
                    登录功能已关闭——任何能访问此服务器的人都拥有完全权限。这对可信的本地机器来说没有问题。若要求输入密码，请在 <Code>config.yaml</Code> 中设置 <code className="font-mono">auth.enabled: true</code>，
                    配置高强度的 <code className="font-mono">LIWAN_JWT_SECRET</code>，然后重启。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ════ STORAGE ════ */}
          {tab === 'storage' && (
            <div>
              {infoLoading ? (
                <div className="px-5 py-8 flex justify-center"><Loader2 size={16} className="animate-spin text-ink-faint" /></div>
              ) : (
                <>
                  <Row label="文件存储" hint="文档及其版本历史的持久化位置。">
                    <Pill tone="info" Icon={info?.storage?.backend === 'postgres' ? Database : HardDrive}>
                      {info?.storage?.backend === 'postgres' ? 'PostgreSQL' : '本地文件'}
                    </Pill>
                  </Row>
                  <div className="border-t border-line">
                    <Row label="数据目录" hint="本地文件与版本存储在磁盘上的位置。">
                      <Code>{info?.storage?.data_dir || './data'}</Code>
                    </Row>
                  </div>
                  <div className="border-t border-line">
                    <Row label="上传目录" hint="嵌入的图片和附件的写入位置。">
                      <Code>{info?.storage?.uploads_dir || './uploads'}</Code>
                    </Row>
                  </div>

                  <SectionLabel Icon={Boxes}>对象存储（二进制数据）</SectionLabel>
                  <div className="px-5 pb-1">
                    {info?.storage?.object_store?.active ? (
                      <div className="space-y-3 pb-3">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm text-ink">后端</span>
                          <Pill tone="ok" Icon={CheckCircle2}>
                            {info.storage.object_store.kind === 'minio' ? 'MinIO / S3' : 'Tigris'} · 已连接
                          </Pill>
                        </div>
                        {info.storage.object_store.endpoint && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm text-ink-muted">端点</span>
                            <Code>{info.storage.object_store.endpoint}</Code>
                          </div>
                        )}
                        {info.storage.object_store.bucket && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm text-ink-muted">存储桶</span>
                            <Code>{info.storage.object_store.bucket}</Code>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-2xs text-ink-faint leading-relaxed pb-3">
                        未配置对象存储——二进制数据从本地 <Code>data_dir</Code> 提供。
                        若要使用兼容 S3 的存储（MinIO / AWS S3 / Tigris），请设置 <code className="font-mono">VULOS_MINIO_ENDPOINT</code>、
                        <code className="font-mono"> VULOS_MINIO_BUCKET</code> 以及凭据，然后重启。参见 <Code>SELFHOST.md</Code>。
                      </p>
                    )}
                  </div>

                  <div className="border-t border-line px-5 py-3 bg-bg-elev2">
                    <p className="text-2xs text-ink-faint leading-relaxed flex items-start gap-2">
                      <Folder size={12} className="mt-0.5 flex-shrink-0" />
                      存储通过 <code className="font-mono">config.yaml</code> 和环境变量配置，而非在此界面中设置，
                      以保证配置可复现并便于版本控制。
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ════ ADMIN (admin only) ════ */}
          {tab === 'admin' && isAdmin && (
            <div className="p-5 space-y-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={14} className="text-accent-press" />
                  <p className="mono-label">邀请令牌</p>
                </div>
                <InvitesPanel onError={(m: string) => m && showToast(m, 'error')} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={14} className="text-accent-press" />
                  <p className="mono-label">审计日志</p>
                </div>
                <AuditPanel onError={(m: string) => m && showToast(m, 'error')} />
              </div>
            </div>
          )}
        </Card>

        <p className="text-center text-2xs text-ink-faint tracking-eyebrow uppercase pb-4">
          Liwan 议事厅——开源、可自托管的办公套件
          {' · '}
          <a
            href="/licenses.txt"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-ink-muted"
          >
            第三方许可证
          </a>
        </p>
      </div>

      {toast}
    </div>
  )
}
