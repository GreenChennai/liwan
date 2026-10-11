/**
 * src/apps/sheets/FilterPanel.tsx
 *
 * Filter views — named saved filters per sheet.
 * Each filter view is a list of per-column rules (text-contains, equals,
 * number-range, not-empty). The active view hides rows that don't match all rules.
 *
 * This component manages the UI; actual row-hiding is signalled via onApply(hiddenRows).
 *
 * Props:
 *   data        {Sheet[]}     — Fortune Sheet workbook data
 *   onClose     {fn}          — close panel
 *   onApply     {fn(rowsToHide: number[])} — called when a view is activated
 */
import { useState, useMemo, useCallback } from 'react'
import { X, Plus, Trash2, Filter, CheckCircle, Pencil } from 'lucide-react'
import { Button, IconButton } from '../../components/ui'

export interface FPCellValue {
  v?: string | number | boolean
  m?: string | number
  [key: string]: unknown
}
export interface FPCellEntry {
  r: number
  c: number
  v?: FPCellValue | null
}
export interface FPSheet {
  celldata?: FPCellEntry[]
  [key: string]: unknown
}

export interface FilterRule {
  colIndex: number
  type: string
  value: string
  min: string
  max: string
}

export interface FilterView {
  name: string
  rules: FilterRule[]
}

export interface FilterPanelProps {
  data: FPSheet[]
  onClose: () => void
  onApply: (hiddenRows: number[]) => void
}

// ── Row/cell helpers ──────────────────────────────────────────────────────────

function sheetToRows(sheet: FPSheet | null | undefined): string[][] {
  const cells = sheet?.celldata || []
  let maxR = 0, maxC = 0
  for (const { r, c } of cells) {
    if (r > maxR) maxR = r
    if (c > maxC) maxC = c
  }
  const grid: string[][] = Array.from({ length: maxR + 1 }, () => new Array<string>(maxC + 1).fill(''))
  for (const { r, c, v } of cells) {
    if (!v) continue
    grid[r][c] = String(v.v !== undefined ? v.v : (v.m ?? ''))
  }
  return grid
}

function matchesRule(value: unknown, rule: FilterRule | null | undefined): boolean {
  if (!rule || !rule.type) return true
  const scalarStr = (x: unknown): string =>
    typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean' ? String(x) : ''
  const v = scalarStr(value).toLowerCase()
  const rv = scalarStr(rule.value).toLowerCase()
  switch (rule.type) {
    case 'contains':      return v.includes(rv)
    case 'equals':        return v === rv
    case 'not-empty':     return v !== ''
    case 'number-gte':    return Number(value) >= Number(rule.value)
    case 'number-lte':    return Number(value) <= Number(rule.value)
    case 'number-range': {
      const n = Number(value)
      return n >= Number(rule.min) && n <= Number(rule.max)
    }
    default: return true
  }
}

function computeHiddenRows(rows: string[][], filterRules: FilterRule[]): number[] {
  if (!rows || rows.length === 0) return []
  const hidden: number[] = []
  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri]
    let fail = false
    for (const rule of filterRules) {
      const val = row[rule.colIndex] ?? ''
      if (!matchesRule(val, rule)) { fail = true; break }
    }
    if (fail) hidden.push(ri)
  }
  return hidden
}

// ── Saved views store (in-component state; would be persisted to sheet metadata in production) ──

const CONDITION_TYPES = [
  { value: 'contains',     label: '文本包含' },
  { value: 'equals',       label: '等于' },
  { value: 'not-empty',    label: '非空' },
  { value: 'number-gte',   label: '数字 ≥' },
  { value: 'number-lte',   label: '数字 ≤' },
  { value: 'number-range', label: '数字介于' },
]

export default function FilterPanel({ data, onClose, onApply }: FilterPanelProps) {
  const activeSheet  = data?.[0]
  const rows         = useMemo(() => sheetToRows(activeSheet), [activeSheet])
  const headers      = rows[0] || []

  // savedViews: [{ name, rules }]
  const [savedViews,  setSavedViews]  = useState<FilterView[]>([])
  const [activeView,  setActiveView]  = useState<number | null>(null) // index into savedViews
  const [editRules,   setEditRules]   = useState<FilterRule[]>([])   // current editing rules
  const [viewName,    setViewName]    = useState('')
  const [editing,     setEditing]     = useState(false)

  const startNew = () => {
    setEditing(true)
    setViewName('筛选视图 ' + (savedViews.length + 1))
    setEditRules([])
    setActiveView(null)
  }

  const editExisting = (idx: number) => {
    setEditing(true)
    setViewName(savedViews[idx].name)
    setEditRules([...savedViews[idx].rules])
    setActiveView(idx)
  }

  const addRule = () => {
    setEditRules((r) => [...r, { colIndex: 0, type: 'contains', value: '', min: '', max: '' }])
  }

  const removeRule = (i: number) => setEditRules((r) => r.filter((_, idx) => idx !== i))

  const updateRule = (i: number, key: keyof FilterRule, val: string | number) => {
    setEditRules((r) => r.map((rule, idx) => idx === i ? { ...rule, [key]: val } : rule))
  }

  const saveView = () => {
    const view: FilterView = { name: viewName || '筛选视图', rules: editRules }
    if (activeView !== null) {
      setSavedViews((v) => v.map((sv, i) => i === activeView ? view : sv))
    } else {
      setSavedViews((v) => [...v, view])
    }
    setEditing(false)
  }

  const applyView = useCallback((idx: number) => {
    const view = savedViews[idx]
    if (!view) return
    const hidden = computeHiddenRows(rows, view.rules)
    onApply(hidden)
    setActiveView(idx)
  }, [savedViews, rows, onApply])

  const clearFilter = () => { onApply([]); setActiveView(null) }

  const deleteView = (idx: number) => {
    setSavedViews((v) => v.filter((_, i) => i !== idx))
    if (activeView === idx) { onApply([]); setActiveView(null) }
  }

  const inputCls = 'w-full rounded border border-line bg-bg px-2 py-1 text-xs text-ink focus:outline-none focus:border-line-strong'
  const selCls   = inputCls

  return (
    <div className="flex flex-col w-full sm:w-72 flex-shrink-0 h-full border-l border-line bg-paper overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line">
        <span className="text-xs font-semibold text-ink tracking-tightish flex items-center gap-1.5">
          <Filter size={12} /> 筛选视图
        </span>
        <IconButton size="sm" title="关闭" onClick={onClose}><X size={13} /></IconButton>
      </div>

      <div className="flex-1 px-3 py-3 space-y-3 text-xs overflow-y-auto">
        {/* Saved views list */}
        {!editing && (
          <>
            {savedViews.length === 0 && (
              <p className="text-ink-faint">尚未保存任何筛选视图。</p>
            )}
            {savedViews.map((sv, i) => (
              <div key={i} className={[
                'flex items-center gap-2 px-2 py-1.5 rounded-md border',
                activeView === i ? 'border-accent bg-accent-tint' : 'border-line',
              ].join(' ')}>
                <Filter size={10} className={activeView === i ? 'text-accent' : 'text-ink-faint'} />
                <span className="flex-1 text-ink truncate">{sv.name}</span>
                <button
                  onClick={() => applyView(i)}
                  className="text-accent hover:underline rounded-sm focus-visible:outline-none focus-visible:shadow-focus"
                  aria-label="应用筛选"
                  title="应用筛选"
                >
                  <CheckCircle size={12} />
                </button>
                <button onClick={() => editExisting(i)} aria-label="编辑筛选视图" className="text-ink-faint hover:text-ink rounded-sm focus-visible:outline-none focus-visible:shadow-focus" title="编辑"><Pencil size={11} /></button>
                <button onClick={() => deleteView(i)} aria-label="删除筛选视图" className="text-ink-faint hover:text-danger rounded-sm focus-visible:outline-none focus-visible:shadow-focus" title="删除">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={startNew} className="flex-1">
                <Plus size={11} className="mr-1" /> 新建筛选
              </Button>
              {activeView !== null && (
                <Button variant="secondary" size="sm" onClick={clearFilter}>
                  清除
                </Button>
              )}
            </div>
          </>
        )}

        {/* Rule editor */}
        {editing && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-ink-muted font-medium">名称</label>
              <input
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                className={inputCls}
                placeholder="筛选视图名称"
              />
            </div>

            {editRules.map((rule, i) => (
              <div key={i} className="border border-line rounded-md p-2 space-y-1.5 relative">
                <button
                  onClick={() => removeRule(i)}
                  className="absolute top-1 right-1 text-ink-faint hover:text-danger"
                >
                  <X size={11} />
                </button>

                <div className="space-y-1">
                  <label className="text-ink-muted">列</label>
                  <select
                    value={rule.colIndex}
                    onChange={(e) => updateRule(i, 'colIndex', Number(e.target.value))}
                    className={selCls}
                  >
                    {headers.map((h, ci) => (
                      <option key={ci} value={ci}>{h || `第 ${ci + 1} 列`}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-ink-muted">条件</label>
                  <select
                    value={rule.type}
                    onChange={(e) => updateRule(i, 'type', e.target.value)}
                    className={selCls}
                  >
                    {CONDITION_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                </div>

                {(rule.type === 'contains' || rule.type === 'equals' || rule.type === 'number-gte' || rule.type === 'number-lte') && (
                  <input
                    value={rule.value}
                    onChange={(e) => updateRule(i, 'value', e.target.value)}
                    className={inputCls}
                    placeholder="值"
                  />
                )}

                {rule.type === 'number-range' && (
                  <div className="flex gap-1">
                    <input
                      value={rule.min}
                      onChange={(e) => updateRule(i, 'min', e.target.value)}
                      className={inputCls}
                      placeholder="最小值"
                    />
                    <input
                      value={rule.max}
                      onChange={(e) => updateRule(i, 'max', e.target.value)}
                      className={inputCls}
                      placeholder="最大值"
                    />
                  </div>
                )}
              </div>
            ))}

            <Button variant="secondary" size="sm" onClick={addRule} className="w-full">
              <Plus size={11} className="mr-1" /> 添加规则
            </Button>

            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={saveView} className="flex-1">
                保存
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)} className="flex-1">
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
