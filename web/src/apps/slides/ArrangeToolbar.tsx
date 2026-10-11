/**
 * ArrangeToolbar.jsx — contextual toolbar shown when object(s) are selected (P3).
 *
 * Surfaces z-order, group/ungroup, align, and distribute. Pure presentational:
 * it calls the pure ops in slideArrange.js via the handlers passed down and lets
 * the parent persist. Dark-aesthetic primitives (IconButton/Tooltip/divider)
 * match the redesign; every control is keyboard reachable + aria-labelled.
 */

import {
  BringToFront, SendToBack, ChevronUp, ChevronDown,
  Group, Ungroup, Trash2,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react'
import { IconButton, Tooltip } from '../../components/ui'
import type { AlignEdge, DistributeAxis } from './slideArrange'

type ArrangeAction =
  | 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack'
  | 'group' | 'ungroup' | 'align' | 'distribute'

interface ArrangeToolbarProps {
  count: number
  canGroup: boolean
  canUngroup: boolean
  onArrange: (action: ArrangeAction, arg?: AlignEdge | DistributeAxis) => void
  onDelete: () => void
}

export default function ArrangeToolbar({
  count, canGroup, canUngroup, onArrange, onDelete,
}: ArrangeToolbarProps) {
  const Sep = () => <span className="toolbar-divider" />
  const multi = count > 1
  const canDistribute = count >= 3
  return (
    <div
      className="toolbar-surface flex items-center gap-0.5 px-2 sm:px-3 h-auto min-h-10 py-1 flex-wrap"
      role="toolbar"
      aria-label="排列对象"
      aria-orientation="horizontal"
    >
      <span className="text-2xs font-semibold text-ink-faint uppercase tracking-eyebrow pr-1">
        已选 {count} 项
      </span>
      <Sep />
      {/* z-order */}
      <Tooltip label="置于顶层">
        <IconButton size="sm" onClick={() => onArrange('bringToFront')} aria-label="置于顶层">
          <BringToFront size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label="上移一层">
        <IconButton size="sm" onClick={() => onArrange('bringForward')} aria-label="上移一层">
          <ChevronUp size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label="下移一层">
        <IconButton size="sm" onClick={() => onArrange('sendBackward')} aria-label="下移一层">
          <ChevronDown size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label="置于底层">
        <IconButton size="sm" onClick={() => onArrange('sendToBack')} aria-label="置于底层">
          <SendToBack size={14} />
        </IconButton>
      </Tooltip>

      <Sep />
      {/* group / ungroup */}
      <Tooltip label="组合 (⌘G)">
        <IconButton size="sm" disabled={!canGroup} onClick={() => onArrange('group')} aria-label="组合">
          <Group size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label="取消组合 (⌘⇧G)">
        <IconButton size="sm" disabled={!canUngroup} onClick={() => onArrange('ungroup')} aria-label="取消组合">
          <Ungroup size={14} />
        </IconButton>
      </Tooltip>

      <Sep />
      {/* align */}
      <Tooltip label="左对齐"><IconButton size="sm" onClick={() => onArrange('align', 'left')} aria-label="左对齐"><AlignStartVertical size={14} /></IconButton></Tooltip>
      <Tooltip label="水平居中"><IconButton size="sm" onClick={() => onArrange('align', 'center')} aria-label="水平居中"><AlignCenterVertical size={14} /></IconButton></Tooltip>
      <Tooltip label="右对齐"><IconButton size="sm" onClick={() => onArrange('align', 'right')} aria-label="右对齐"><AlignEndVertical size={14} /></IconButton></Tooltip>
      <Tooltip label="顶对齐"><IconButton size="sm" onClick={() => onArrange('align', 'top')} aria-label="顶对齐"><AlignStartHorizontal size={14} /></IconButton></Tooltip>
      <Tooltip label="垂直居中"><IconButton size="sm" onClick={() => onArrange('align', 'middle')} aria-label="垂直居中"><AlignCenterHorizontal size={14} /></IconButton></Tooltip>
      <Tooltip label="底对齐"><IconButton size="sm" onClick={() => onArrange('align', 'bottom')} aria-label="底对齐"><AlignEndHorizontal size={14} /></IconButton></Tooltip>

      {canDistribute && (
        <>
          <Sep />
          <Tooltip label="水平分布"><IconButton size="sm" onClick={() => onArrange('distribute', 'horizontal')} aria-label="水平分布"><AlignHorizontalDistributeCenter size={14} /></IconButton></Tooltip>
          <Tooltip label="垂直分布"><IconButton size="sm" onClick={() => onArrange('distribute', 'vertical')} aria-label="垂直分布"><AlignVerticalDistributeCenter size={14} /></IconButton></Tooltip>
        </>
      )}

      <Sep />
      <Tooltip label="删除 (⌫)">
        <IconButton size="sm" className="hover:text-danger" onClick={onDelete} aria-label="删除对象">
          <Trash2 size={14} />
        </IconButton>
      </Tooltip>
      {multi && <span className="sr-only">已选择多个对象</span>}
    </div>
  )
}
