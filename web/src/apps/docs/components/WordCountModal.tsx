/**
 * WordCountModal — detailed word/character/page count breakdown.
 *
 * Opens from Tools → Word count or clicking the status bar.
 *
 * Props:
 *   editor   {Editor}    TipTap editor instance
 *   onClose  {function}
 */

import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { X, Type, AlignLeft, FileText } from 'lucide-react'
import { useDialogA11y } from '../../../components/ui'
import type { Editor } from '@tiptap/react'

// Estimate pages from word count (250 words/page, Google Docs default)
const WORDS_PER_PAGE = 250

function countWords(text: string): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

function countChars(text: string, includeSpaces = true): number {
  if (!text) return 0
  return includeSpaces ? text.length : text.replace(/\s/g, '').length
}

function getSelectionText(editor: Editor | null | undefined): string {
  if (!editor) return ''
  const { from, to } = editor.state.selection
  if (from === to) return ''
  return editor.state.doc.textBetween(from, to, ' ')
}

export interface WordCountModalProps {
  editor: Editor | null | undefined
  onClose: () => void
}

export default function WordCountModal({ editor, onClose }: WordCountModalProps) {
  const dialogRef = useRef(null)
  // Trap focus, close on Esc, restore focus to the trigger on close.
  useDialogA11y(dialogRef, onClose)

  const stats = useMemo(() => {
    if (!editor) return null
    const fullText = editor.getText()
    const selText = getSelectionText(editor)
    const words = countWords(fullText)
    const chars = countChars(fullText)
    const charsNoSpaces = countChars(fullText, false)
    const pages = Math.max(1, Math.ceil(words / WORDS_PER_PAGE))
    const paragraphs = (editor.state.doc.content.content || [])
      .filter((n) => n.type.name === 'paragraph').length

    const selWords = countWords(selText)
    const selChars = countChars(selText)
    const hasSelection = selText.length > 0

    return { words, chars, charsNoSpaces, pages, paragraphs, selWords, selChars, hasSelection }
  }, [editor])

  if (!stats) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="字数统计"
        className="bg-paper border border-line rounded-xl shadow-e3 w-80 overflow-hidden animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-bg-elev2">
          <div className="flex items-center gap-2">
            <Type size={14} className="text-ink-muted" />
            <span className="text-sm font-semibold text-ink tracking-tightish">字数统计</span>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="w-6 h-6 flex items-center justify-center rounded-sm text-ink-faint hover:bg-bg-elev2 hover:text-ink transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {/* Stats grid */}
        <div className="px-4 py-4 space-y-3">
          <StatRow icon={<AlignLeft size={13} />} label="字数" value={stats.words.toLocaleString()} />
          <StatRow icon={<Type size={13} />} label="字符数（含空格）" value={stats.chars.toLocaleString()} />
          <StatRow icon={<Type size={13} />} label="字符数（不含空格）" value={stats.charsNoSpaces.toLocaleString()} />
          <StatRow icon={<FileText size={13} />} label="页数（估算）" value={stats.pages.toLocaleString()} />
          <StatRow icon={<AlignLeft size={13} />} label="段落数" value={stats.paragraphs.toLocaleString()} />
        </div>

        {/* Selection stats */}
        {stats.hasSelection && (
          <>
            <div className="mx-4 border-t border-line" />
            <div className="px-4 py-3 space-y-2">
              <p className="text-2xs font-semibold text-ink-faint tracking-eyebrow uppercase">所选内容</p>
              <StatRow label="字数" value={stats.selWords.toLocaleString()} />
              <StatRow label="字符数" value={stats.selChars.toLocaleString()} />
            </div>
          </>
        )}

        {/* Footer note */}
        <div className="px-4 py-2.5 border-t border-line bg-bg-elev2">
          <p className="text-2xs text-ink-faint">页数按每页 {WORDS_PER_PAGE} 字估算。</p>
        </div>
      </div>
    </div>
  )
}

interface StatRowProps {
  icon?: ReactNode
  label: string
  value: string
}

function StatRow({ icon, label, value }: StatRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        {icon && <span className="text-ink-faint">{icon}</span>}
        {label}
      </div>
      <span className="text-sm font-semibold text-ink tabular-nums">{value}</span>
    </div>
  )
}
