/**
 * TransitionPanel.jsx — per-slide transition picker + per-element animation panel.
 *
 * Transitions map directly to reveal.js data-transition attributes.
 * Element animations store a list in slide.animations[].
 *
 * Format of slide.animations:
 *   [{ id, label, type, effect, order }]
 *   type: 'entrance' | 'exit' | 'emphasis'
 *   effect: 'fade-in' | 'fly-in' | 'bounce' | 'zoom-in' | 'custom'
 */

import { useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import type { SlideLike } from './slideObjects'
import type { SlideAnimation, AnimationType, AnimationEffect } from './slideAnimations'

/** The slide shape this panel reads/writes: the generic slide plus the two
 * fields it owns (transition + per-element animations). */
export interface TransitionSlide extends SlideLike {
  transition?: string | undefined
  animations?: SlideAnimation[] | undefined
}

interface TransitionPanelProps {
  slide: TransitionSlide
  onChange: (slide: TransitionSlide) => void
}

export const SLIDE_TRANSITIONS = [
  { id: 'none',    label: '无' },
  { id: 'fade',    label: '淡入淡出' },
  { id: 'slide',   label: '滑动' },
  { id: 'convex',  label: '推入' },
  { id: 'concave', label: '显现' },
  { id: 'zoom',    label: '缩放' },
]

const ANIMATION_TYPES: AnimationType[] = ['entrance', 'exit', 'emphasis']
const ANIMATION_TYPE_LABELS: Record<string, string> = { entrance: '进入', exit: '退出', emphasis: '强调' }
const ANIMATION_EFFECTS: AnimationEffect[] = ['fade-in', 'fly-in', 'bounce', 'zoom-in', 'spin', 'custom']
const ANIMATION_EFFECT_LABELS: Record<string, string> = {
  'fade-in': '淡入', 'fly-in': '飞入', bounce: '弹跳', 'zoom-in': '放大进入', spin: '旋转', custom: '自定义',
}

export default function TransitionPanel({ slide, onChange }: TransitionPanelProps) {
  const transition = slide.transition || 'none'
  const animations = slide.animations || []
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  const setTransition = (t: string) => onChange({ ...slide, transition: t })

  const addAnimation = () => {
    const anim: SlideAnimation = {
      id: crypto.randomUUID(),
      label: '新建动画',
      type: 'entrance',
      effect: 'fade-in',
      order: animations.length,
    }
    onChange({ ...slide, animations: [...animations, anim] })
  }

  const removeAnimation = (id: string | undefined) => {
    onChange({
      ...slide,
      animations: animations.filter((a) => a.id !== id).map((a, i) => ({ ...a, order: i })),
    })
  }

  const updateAnimation = (id: string | undefined, key: 'label' | 'type' | 'effect', value: string) => {
    onChange({
      ...slide,
      animations: animations.map((a) => a.id === id ? { ...a, [key]: value } : a),
    })
  }

  // Drag-reorder
  const handleDragEnd = () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null); setOverIdx(null); return
    }
    const next = [...animations]
    const [item] = next.splice(dragIdx, 1)
    next.splice(overIdx, 0, item)
    onChange({ ...slide, animations: next.map((a, i) => ({ ...a, order: i })) })
    setDragIdx(null); setOverIdx(null)
  }

  return (
    <div className="space-y-4">
      {/* Transition picker */}
      <div>
        <p className="text-2xs font-semibold text-ink-faint uppercase tracking-eyebrow mb-2">
          幻灯片切换效果
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {SLIDE_TRANSITIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={transition === t.id}
              onClick={() => setTransition(t.id)}
              className={[
                'py-1.5 text-xs rounded-md border transition-colors',
                transition === t.id
                  ? 'border-accent bg-accent-tint text-accent font-semibold'
                  : 'border-line text-ink-muted hover:border-line-strong',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Animations */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-2xs font-semibold text-ink-faint uppercase tracking-eyebrow">
            动画
          </p>
          <button
            type="button"
            onClick={addAnimation}
            className="inline-flex items-center gap-1 text-2xs text-accent hover:text-accent/80 transition-colors"
          >
            <Plus size={10} /> 添加
          </button>
        </div>

        {animations.length === 0 && (
          <p className="text-2xs text-ink-faint italic">暂无动画。点击“添加”新建一个。</p>
        )}

        <div className="space-y-1.5">
          {animations.map((anim, i) => (
            <div
              key={anim.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(i) }}
              onDragEnd={handleDragEnd}
              className={[
                'flex items-center gap-1.5 p-1.5 rounded-md border bg-bg',
                overIdx === i && dragIdx !== i ? 'border-accent' : 'border-line',
              ].join(' ')}
            >
              <GripVertical size={12} className="text-ink-faint flex-shrink-0 cursor-grab" />
              <span className="text-2xs text-ink-faint w-5 text-right flex-shrink-0">
                {i + 1}.
              </span>
              <input
                type="text"
                value={anim.label}
                onChange={(e) => updateAnimation(anim.id, 'label', e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-xs text-ink outline-none border-b border-transparent hover:border-line focus:border-accent"
                placeholder="元素名称"
              />
              <select
                value={anim.type}
                onChange={(e) => updateAnimation(anim.id, 'type', e.target.value)}
                className="text-2xs bg-bg text-ink border border-line rounded-sm px-1 h-6"
              >
                {ANIMATION_TYPES.map((t) => <option key={t} value={t}>{ANIMATION_TYPE_LABELS[t]}</option>)}
              </select>
              <select
                value={anim.effect}
                onChange={(e) => updateAnimation(anim.id, 'effect', e.target.value)}
                className="text-2xs bg-bg text-ink border border-line rounded-sm px-1 h-6"
              >
                {ANIMATION_EFFECTS.map((e) => <option key={e} value={e}>{ANIMATION_EFFECT_LABELS[e]}</option>)}
              </select>
              <button
                type="button"
                onClick={() => removeAnimation(anim.id)}
                className="text-ink-faint hover:text-danger transition-colors flex-shrink-0"
                aria-label="删除动画"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
