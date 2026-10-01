export type Role = '版师' | '产品'

export type Measurement = {
  key: string
  name: string
  spec: number
  actual: number
  tolerance: number
}

export type Annotation = {
  id: string
  x: number
  y: number
  part: string
  content: string
  author: string
  status: '待处理' | '已解决'
}

export type RevisionProposal = {
  id: string
  author: string
  role: string
  content: string
  affectedPart: string
  status: '待决定' | '已采纳' | '未采纳'
}

export type ConclusionDecision = {
  proposalId: string
  decision: '已采纳' | '未采纳'
  reason: string
  decidedAt: string
}

/**
 * 版型结论：把「量体快照 → 超差部位 → 认可方案 → 冻结版本」接成一条不可变结论。
 * 每次提交确认都会追加一个新版本；冻结版只追加、不覆盖。
 */
export type Conclusion = {
  id: string
  version: number
  round: '第一轮' | '第二轮' | '第三轮'
  baselineRound: '第一轮' | '第二轮' | '第三轮'
  role: Role
  measurements: Measurement[]
  outOfTolerance: string[]
  decisions: ConclusionDecision[]
  note: string
  status: '已确认' | '已冻结'
  committedAt: string
}

export type Sample = {
  id: string
  styleCode: string
  styleName: string
  category: string
  developmentSeason: string
  supplier: string
  dueDate: string
  owner: string
  status: '开发中' | '待审核' | '已锁定'
  fabric: string
  colorway: string
  craft: string[]
  measurements: Record<'第一轮' | '第二轮' | '第三轮', Measurement[]>
  annotations: Annotation[]
  proposals: RevisionProposal[]
  attachments: Array<{ name: string; type: string; owner: string }>
  comments: Array<{ id: string; author: string; content: string; date: string }>
  /** 乐观锁版本号：每次提交结论 +1，用于并发冲突检测。 */
  version: number
  /** 已提交的版型结论链（只追加，冻结版不可变）。 */
  conclusions: Conclusion[]
}
