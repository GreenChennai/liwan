// Built-in, STATIC document templates for Docs and Sheets (parity with the
// Slides deck gallery). These seed a brand-new file's content.
//
// SECURITY: all content here is authored in-repo (no user/network input) and is
// a plain data structure, not HTML. Docs content is a ProseMirror/Tiptap JSON
// doc (nodes + marks), which the editor renders through its schema — there is
// no HTML injection surface. Sheets content is a luckysheet-style celldata
// array of primitive cell values. Both are re-validated by the editors' own
// import guards on load, exactly like the blank shapes in filesStore.

// ── helpers to keep the Tiptap JSON terse ──────────────────────────────────
export type TiptapMark = { type: string; attrs?: Record<string, unknown> }
export type TiptapNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  text?: string
  marks?: TiptapMark[]
}

const text = (s: string, marks?: TiptapMark[]): TiptapNode =>
  (marks ? { type: 'text', text: s, marks } : { type: 'text', text: s })
const bold = (s: string): TiptapNode => text(s, [{ type: 'bold' }])
const heading = (level: number, ...content: TiptapNode[]): TiptapNode => ({ type: 'heading', attrs: { level }, content })
const para = (...content: TiptapNode[]): TiptapNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' })
const bullet = (...items: string[]): TiptapNode => ({
  type: 'bulletList',
  content: items.map((s) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [text(s)] }] })),
})

export type DocTemplate = { id: string; label: string; desc: string; content: TiptapNode }
export type SheetTemplate = { id: string; label: string; desc: string; content: SheetTab[] }

// ── Docs templates (Tiptap JSON) ───────────────────────────────────────────
export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: 'blank',
    label: '空白',
    desc: '空白文档',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  },
  {
    id: 'resume',
    label: '简历',
    desc: '姓名、工作经历、教育背景、技能',
    content: {
      type: 'doc',
      content: [
        heading(1, text('你的姓名')),
        para(text('城市，国家 · you@email.com · (000) 000-0000')),
        heading(2, text('个人简介')),
        para(text('用两行简要介绍你是谁，以及你能带来的价值。')),
        heading(2, text('工作经历')),
        para(bold('职位'), text(' — 公司名称 · 20XX 年至今')),
        bullet('一项可量化的主要成果。', '另一项职责或成就。'),
        heading(2, text('教育背景')),
        para(bold('学位'), text(' — 院校名称 · 20XX 年')),
        heading(2, text('技能')),
        para(text('技能一 · 技能二 · 技能三 · 技能四')),
      ],
    },
  },
  {
    id: 'letter',
    label: '信函',
    desc: '正式的齐头式信函',
    content: {
      type: 'doc',
      content: [
        para(text('你的姓名')),
        para(text('你的地址')),
        para(text('日期')),
        para(),
        para(text('收件人姓名')),
        para(text('收件人地址')),
        para(),
        para(text('尊敬的 [收件人]：')),
        para(text('开头段落，说明写信的目的。')),
        para(text('正文段落，补充相关细节和背景。')),
        para(text('结尾段落，明确提出行动请求或后续步骤。')),
        para(),
        para(text('此致敬礼，')),
        para(text('你的姓名')),
      ],
    },
  },
  {
    id: 'meeting-notes',
    label: '会议纪要',
    desc: '议程、记录、待办事项',
    content: {
      type: 'doc',
      content: [
        heading(1, text('会议纪要')),
        para(bold('日期：'), text('__________   '), bold('参会人：'), text('__________')),
        heading(2, text('议程')),
        bullet('议题一', '议题二', '议题三'),
        heading(2, text('讨论')),
        para(text('在此记录要点和决议。')),
        heading(2, text('待办事项')),
        bullet('负责人 — 任务 — 截止日期', '负责人 — 任务 — 截止日期'),
      ],
    },
  },
]

// ── Sheets templates (luckysheet-style: [{ name, celldata, config }]) ───────
// celldata entries are { r, c, v: { v: value, m: display, bl?: 1 } }.
export type SheetCellValue = string | number
export type SheetCell = { r: number; c: number; v: { v: SheetCellValue; m: string; bl?: 1 } }
export type SheetTab = { name: string; celldata: SheetCell[]; config: Record<string, unknown> }

const cell = (r: number, c: number, v: SheetCellValue, boldCell: boolean): SheetCell =>
  ({ r, c, v: { v, m: String(v), ...(boldCell ? { bl: 1 } : {}) } })

function sheet(name: string, rows: SheetCellValue[][]): SheetTab[] {
  const celldata: SheetCell[] = []
  rows.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val === null || val === undefined || val === '') return
      celldata.push(cell(r, c, val, r === 0))
    })
  })
  return [{ name, celldata, config: {} }]
}

export const SHEET_TEMPLATES: SheetTemplate[] = [
  {
    id: 'blank',
    label: '空白',
    desc: '空白表格',
    content: [{ name: '工作表1', celldata: [], config: {} }],
  },
  {
    id: 'budget',
    label: '月度预算',
    desc: '收入、支出与结余',
    content: sheet('预算', [
      ['类别', '计划', '实际', '差额'],
      ['收入', 3000, 3000, 0],
      ['房租', 1200, 1200, 0],
      ['食品杂货', 400, 0, 0],
      ['交通', 150, 0, 0],
      ['水电费', 200, 0, 0],
      ['储蓄', 500, 0, 0],
      ['合计', '', '', ''],
    ]),
  },
  {
    id: 'calendar',
    label: '每周日程',
    desc: '7 天的计划表网格',
    content: sheet('本周', [
      ['时间', '周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      ['09:00', '', '', '', '', '', '', ''],
      ['10:00', '', '', '', '', '', '', ''],
      ['11:00', '', '', '', '', '', '', ''],
      ['12:00', '', '', '', '', '', '', ''],
      ['13:00', '', '', '', '', '', '', ''],
      ['14:00', '', '', '', '', '', '', ''],
      ['15:00', '', '', '', '', '', '', ''],
      ['16:00', '', '', '', '', '', '', ''],
    ]),
  },
  {
    id: 'tracker',
    label: '任务跟踪',
    desc: '状态、负责人与截止日期',
    content: sheet('任务', [
      ['任务', '负责人', '状态', '优先级', '截止'],
      ['示例任务', '姓名', '待办', '高', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
    ]),
  },
]

export function templatesFor(type: string): DocTemplate[] | SheetTemplate[] | null {
  if (type === 'doc') return DOC_TEMPLATES
  if (type === 'sheet') return SHEET_TEMPLATES
  return null
}
