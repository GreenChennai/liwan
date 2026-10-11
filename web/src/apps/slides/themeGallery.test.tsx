/**
 * ThemeGallery — a11y + interaction test.
 *
 * Locks the WAI-ARIA tabs contract added in the finalize pass: the tablist and
 * its tabs carry the right roles/state, arrow keys roam + activate tabs, the
 * form controls are label-associated, and Apply reports the chosen theme.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ThemeGallery from './ThemeGallery.jsx'
import { PRESET_THEMES, type SlideTheme } from './themes'

interface OpenProps {
  onApply?: (payload: { themeId: string; customTheme: Partial<SlideTheme> | null }) => void
  onClose?: () => void
}

function open(props: OpenProps = {}) {
  return render(
    <ThemeGallery
      currentThemeId={PRESET_THEMES[0].id}
      customTheme={null}
      onApply={props.onApply || (() => {})}
      onClose={props.onClose || (() => {})}
    />,
  )
}

describe('ThemeGallery tabs a11y', () => {
  it('exposes a labelled tablist with two tabs and one selected', () => {
    open()
    const tablist = screen.getByRole('tablist', { name: /主题来源/ })
    expect(tablist).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    // Presets is selected by default; Custom is not.
    const presets = screen.getByRole('tab', { name: '预设' })
    const custom = screen.getByRole('tab', { name: '自定义' })
    expect(presets).toHaveAttribute('aria-selected', 'true')
    expect(custom).toHaveAttribute('aria-selected', 'false')
    // Roving tabindex: only the active tab is in the tab order.
    expect(presets).toHaveAttribute('tabindex', '0')
    expect(custom).toHaveAttribute('tabindex', '-1')
  })

  it('each tab controls a labelled tabpanel', () => {
    open()
    const presets = screen.getByRole('tab', { name: '预设' })
    expect(presets).toHaveAttribute('aria-controls', 'themepanel-gallery')
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', 'themetab-gallery')
  })

  it('ArrowRight moves selection to the next tab and activates it', () => {
    open()
    const presets = screen.getByRole('tab', { name: '预设' })
    fireEvent.keyDown(presets, { key: 'ArrowRight' })
    const custom = screen.getByRole('tab', { name: '自定义' })
    expect(custom).toHaveAttribute('aria-selected', 'true')
    // The custom panel is now shown (基础预设下拉框是标志).
    expect(screen.getByLabelText('基础预设')).toBeInTheDocument()
  })

  it('ArrowLeft wraps from the first tab to the last', () => {
    open()
    const presets = screen.getByRole('tab', { name: '预设' })
    fireEvent.keyDown(presets, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: '自定义' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('ThemeGallery custom form + apply', () => {
  it('custom-tab form controls are associated with their labels', () => {
    open()
    fireEvent.click(screen.getByRole('tab', { name: '自定义' }))
    // getByLabelText only resolves when htmlFor/id are wired correctly.
    expect(screen.getByLabelText('基础预设')).toBeInTheDocument()
    expect(screen.getByLabelText('标题字体')).toBeInTheDocument()
    expect(screen.getByLabelText('正文字体')).toBeInTheDocument()
    expect(screen.getByLabelText('主色')).toBeInTheDocument()
    expect(screen.getByLabelText('背景')).toBeInTheDocument()
  })

  it('Apply reports the selected theme id', () => {
    const onApply = vi.fn()
    open({ onApply })
    // Pick the second preset tile, then apply.
    const tile = screen.getByRole('button', { name: new RegExp(PRESET_THEMES[1].label, 'i') })
    fireEvent.click(tile)
    fireEvent.click(screen.getByRole('button', { name: /^应用到所有幻灯片/ }))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ themeId: PRESET_THEMES[1].id }),
    )
  })

  it('Escape closes the dialog', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
