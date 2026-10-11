/**
 * themes.js — 15 preset slide themes (fonts + palette + background).
 *
 * Each theme object:
 *   id           unique key, also maps to reveal.js theme name when possible
 *   label        display name
 *   revealTheme  reveal.js CSS theme (may differ from id)
 *   headingFont  CSS font-family for slide titles
 *   bodyFont     CSS font-family for slide body
 *   primary      hex — button / accent
 *   secondary    hex — secondary accent
 *   accent       hex — highlight / link
 *   background   hex — slide background
 *   surface      hex — text-bearing surface (card inside slide)
 *   text         hex — primary text
 *   textMuted    hex — secondary text
 *   dark         boolean — dark bg?
 */
export interface SlideTheme {
  id: string
  label: string
  revealTheme: string
  headingFont: string
  bodyFont: string
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  textMuted: string
  dark: boolean
}

export const PRESET_THEMES: SlideTheme[] = [
  {
    id: 'obsidian',
    label: '黑曜石',
    revealTheme: 'black',
    headingFont: '"Inter", sans-serif',
    bodyFont: '"Inter", sans-serif',
    primary: '#7c6af7',
    secondary: '#a78bfa',
    accent: '#38bdf8',
    background: '#0f0f11',
    surface: '#1a1a22',
    text: '#f1f0ff',
    textMuted: '#9191a8',
    dark: true,
  },
  {
    id: 'slate',
    label: '石板夜色',
    revealTheme: 'night',
    headingFont: '"Sora", sans-serif',
    bodyFont: '"Sora", sans-serif',
    primary: '#4ade80',
    secondary: '#86efac',
    accent: '#22d3ee',
    background: '#0d1117',
    surface: '#161b22',
    text: '#e6edf3',
    textMuted: '#8b949e',
    dark: true,
  },
  {
    id: 'dracula',
    label: '德古拉',
    revealTheme: 'dracula',
    headingFont: '"Fira Code", monospace',
    bodyFont: '"Fira Code", monospace',
    primary: '#bd93f9',
    secondary: '#ff79c6',
    accent: '#50fa7b',
    background: '#282a36',
    surface: '#343746',
    text: '#f8f8f2',
    textMuted: '#6272a4',
    dark: true,
  },
  {
    id: 'moon',
    label: '月光',
    revealTheme: 'moon',
    headingFont: '"Palatino Linotype", serif',
    bodyFont: '"Palatino Linotype", serif',
    primary: '#93c5fd',
    secondary: '#bfdbfe',
    accent: '#fcd34d',
    background: '#002b36',
    surface: '#073642',
    text: '#aab2bc',
    textMuted: '#657b83',
    dark: true,
  },
  {
    id: 'league',
    label: '联盟',
    revealTheme: 'league',
    headingFont: '"League Gothic", Impact, sans-serif',
    bodyFont: '"Lato", sans-serif',
    primary: '#f0be4b',
    secondary: '#e5c07b',
    accent: '#c792ea',
    background: '#1c1e20',
    surface: '#262728',
    text: '#eeeeee',
    textMuted: '#888888',
    dark: true,
  },
  {
    id: 'snow',
    label: '雪白',
    revealTheme: 'white',
    headingFont: '"Helvetica Neue", Helvetica, sans-serif',
    bodyFont: '"Helvetica Neue", Helvetica, sans-serif',
    primary: '#2563eb',
    secondary: '#3b82f6',
    accent: '#0891b2',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#64748b',
    dark: false,
  },
  {
    id: 'sky',
    label: '天空',
    revealTheme: 'sky',
    headingFont: '"Open Sans", sans-serif',
    bodyFont: '"Open Sans", sans-serif',
    primary: '#2563eb',
    secondary: '#0284c7',
    accent: '#0e7490',
    background: '#dbeafe',
    surface: '#eff6ff',
    text: '#1e3a5f',
    textMuted: '#3b82f6',
    dark: false,
  },
  {
    id: 'parchment',
    label: '羊皮纸',
    revealTheme: 'beige',
    headingFont: '"Palatino Linotype", serif',
    bodyFont: '"Georgia", serif',
    primary: '#92400e',
    secondary: '#b45309',
    accent: '#78350f',
    background: '#fef9c3',
    surface: '#fefce8',
    text: '#44371a',
    textMuted: '#78716c',
    dark: false,
  },
  {
    id: 'solarized',
    label: '日光',
    revealTheme: 'solarized',
    headingFont: '"Gill Sans", sans-serif',
    bodyFont: '"Gill Sans", sans-serif',
    primary: '#268bd2',
    secondary: '#2aa198',
    accent: '#d33682',
    background: '#fdf6e3',
    surface: '#eee8d5',
    text: '#657b83',
    textMuted: '#93a1a1',
    dark: false,
  },
  {
    id: 'serif-warm',
    label: '暖色衬线',
    revealTheme: 'serif',
    headingFont: '"Cambria", "Times New Roman", serif',
    bodyFont: '"Cambria", "Times New Roman", serif',
    primary: '#7c3aed',
    secondary: '#a855f7',
    accent: '#c026d3',
    background: '#f5ebe0',
    surface: '#fdf8f0',
    text: '#3b2f2f',
    textMuted: '#7c6f6f',
    dark: false,
  },
  {
    id: 'rose',
    label: '玫瑰晨曦',
    revealTheme: 'simple',
    headingFont: '"Playfair Display", serif',
    bodyFont: '"Source Sans Pro", sans-serif',
    primary: '#e11d48',
    secondary: '#fb7185',
    accent: '#f43f5e',
    background: '#fff1f2',
    surface: '#fff5f5',
    text: '#881337',
    textMuted: '#9f1239',
    dark: false,
  },
  {
    id: 'forest',
    label: '森林',
    revealTheme: 'simple',
    headingFont: '"Merriweather", serif',
    bodyFont: '"Source Sans Pro", sans-serif',
    primary: '#16a34a',
    secondary: '#22c55e',
    accent: '#4ade80',
    background: '#052e16',
    surface: '#064e3b',
    text: '#d1fae5',
    textMuted: '#6ee7b7',
    dark: true,
  },
  {
    id: 'corporate',
    label: '企业',
    revealTheme: 'simple',
    headingFont: '"Roboto", sans-serif',
    bodyFont: '"Roboto", sans-serif',
    primary: '#1d4ed8',
    secondary: '#1e40af',
    accent: '#0369a1',
    background: '#f0f4ff',
    surface: '#ffffff',
    text: '#1e293b',
    textMuted: '#475569',
    dark: false,
  },
  {
    id: 'retro',
    label: '复古',
    revealTheme: 'simple',
    headingFont: '"Space Grotesk", sans-serif',
    bodyFont: '"Space Grotesk", sans-serif',
    primary: '#f97316',
    secondary: '#fb923c',
    accent: '#fbbf24',
    background: '#1a0a00',
    surface: '#2d1700',
    text: '#fde8c8',
    textMuted: '#c4a882',
    dark: true,
  },
  {
    id: 'minimal',
    label: '极简',
    revealTheme: 'simple',
    headingFont: '"DM Sans", sans-serif',
    bodyFont: '"DM Sans", sans-serif',
    primary: '#18181b',
    secondary: '#3f3f46',
    accent: '#71717a',
    background: '#fafafa',
    surface: '#ffffff',
    text: '#09090b',
    textMuted: '#71717a',
    dark: false,
  },
]

export const DEFAULT_THEME_ID = 'obsidian'

/** Look up a theme by id. Falls back to the default. */
export function getTheme(id: string | null | undefined): SlideTheme {
  return PRESET_THEMES.find((t) => t.id === id) || PRESET_THEMES[0]
}

export interface MasterLayout {
  id: string
  label: string
  titleY: string
  titleAlign: 'left' | 'center' | 'right'
  bodyY: string
  bodyAlign: 'left' | 'center' | 'right'
  showLogo: boolean
  footerText: string
}

/** The master-slide layouts per deck. Each deck can have 1–3 masters. */
export const MASTER_LAYOUTS: MasterLayout[] = [
  {
    id: 'title',
    label: '标题母版',
    titleY: '38%',
    titleAlign: 'center',
    bodyY: '62%',
    bodyAlign: 'center',
    showLogo: true,
    footerText: '',
  },
  {
    id: 'content',
    label: '内容母版',
    titleY: '8%',
    titleAlign: 'left',
    bodyY: '25%',
    bodyAlign: 'left',
    showLogo: false,
    footerText: '',
  },
  {
    id: 'section',
    label: '章节母版',
    titleY: '45%',
    titleAlign: 'center',
    bodyY: '70%',
    bodyAlign: 'center',
    showLogo: false,
    footerText: '',
  },
]

export interface DeckTemplateSlide {
  title: string
  content: string
  notes: string
  background: string
  master: string
}

export interface DeckTemplate {
  id: string
  label: string
  description: string
  themeId: string
  slides: DeckTemplateSlide[]
}

/** Pre-built deck templates (seed content). */
export const DECK_TEMPLATES: DeckTemplate[] = [
  {
    id: 'pitch',
    label: '融资路演',
    description: '创业路演：问题、方案、进展与诉求。',
    themeId: 'obsidian',
    slides: [
      { title: '公司名称', content: '<p style="text-align:center">在此填写一句话定位</p>', notes: '介绍自己和公司。', background: '', master: 'title' },
      { title: '痛点问题', content: '<ul><li>痛点 1</li><li>痛点 2</li><li>痛点 3</li></ul>', notes: '让听众感受到这些痛点。', background: '', master: 'content' },
      { title: '我们的方案', content: '<p>简明描述你所构建的产品。</p>', notes: '展示截图或演示。', background: '', master: 'content' },
      { title: '业务进展', content: '<p><strong>$X 年度经常性收入（ARR）</strong> · <strong>N 位客户</strong> · 月环比增长</p>', notes: '使用真实数据。', background: '', master: 'content' },
      { title: '融资诉求', content: '<p>计划以 <strong>$XM 种子轮</strong> 融资，投前估值 $YM。</p>', notes: '直截了当。', background: '', master: 'content' },
    ],
  },
  {
    id: 'project-plan',
    label: '项目计划',
    description: '路线图、里程碑与团队概览。',
    themeId: 'corporate',
    slides: [
      { title: '项目名称', content: '<p style="text-align:center">2026 年第三季度 · 负责人：你的名字</p>', notes: '', background: '', master: 'title' },
      { title: '目标', content: '<ul><li>目标 1</li><li>目标 2</li><li>目标 3</li></ul>', notes: '关联 OKR。', background: '', master: 'content' },
      { title: '里程碑', content: '<ul><li><strong>第 1 个月</strong> – 阶段 A 完成</li><li><strong>第 2 个月</strong> – 阶段 B 完成</li><li><strong>第 3 个月</strong> – 上线</li></ul>', notes: '', background: '', master: 'content' },
      { title: '风险', content: '<ul><li>风险 1 – 缓解措施</li><li>风险 2 – 缓解措施</li></ul>', notes: '', background: '', master: 'content' },
    ],
  },
  {
    id: 'lesson-plan',
    label: '课程教案',
    description: '适用于单节课的课堂幻灯片。',
    themeId: 'sky',
    slides: [
      { title: '课程标题', content: '<p style="text-align:center">学科 · 年级 · 日期</p>', notes: '', background: '', master: 'title' },
      { title: '学习目标', content: '<ul><li>课程结束时，学生将能够……</li><li>目标 2</li></ul>', notes: '', background: '', master: 'content' },
      { title: '导入', content: '<p>引入问题或热身活动</p>', notes: '预留 5 分钟。', background: '', master: 'content' },
      { title: '主要内容', content: '<p>讲解核心概念</p>', notes: '', background: '', master: 'content' },
      { title: '课堂活动', content: '<p>学生练习说明</p>', notes: '关注各小组。', background: '', master: 'content' },
      { title: '小结与作业', content: '<ul><li>要点总结</li><li>课后作业</li></ul>', notes: '', background: '', master: 'content' },
    ],
  },
  {
    id: 'quarterly-review',
    label: '季度复盘',
    description: '环比指标、成果、阻碍与下季度计划。',
    themeId: 'slate',
    slides: [
      { title: '第 ? 季度复盘', content: '<p style="text-align:center">团队名称 · 日期</p>', notes: '', background: '', master: 'title' },
      { title: '指标', content: '<ul><li>指标 A：实际 X，目标 Y</li><li>指标 B：实际 X，目标 Y</li></ul>', notes: '从数据看板获取数据。', background: '', master: 'content' },
      { title: '成果', content: '<ul><li>成果 1</li><li>成果 2</li></ul>', notes: '', background: '', master: 'content' },
      { title: '阻碍', content: '<ul><li>阻碍 1 – 负责人</li><li>阻碍 2 – 负责人</li></ul>', notes: '', background: '', master: 'content' },
      { title: '下季度计划', content: '<ul><li>优先事项 1</li><li>优先事项 2</li><li>优先事项 3</li></ul>', notes: '', background: '', master: 'content' },
    ],
  },
]
