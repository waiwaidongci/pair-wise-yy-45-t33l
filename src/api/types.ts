export const sampleRounds = ['第一轮', '第二轮', '第三轮'] as const
export type SampleRound = (typeof sampleRounds)[number]

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

/** 量体结果版本：实测数字每改动一次，版本号 +1，旧认可据此失效。 */
export type MeasurementVersion = {
  /** 每个部位的实测值与改动时录入的版本号保持一致。 */
  version: number
  changedAt: string
  changedBy: string
  /** 本次量体结果相对上一版改动的部位 key。 */
  changedParts: string[]
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
  measurements: Record<SampleRound, Measurement[]>
  /** key 为轮次，记录该轮量体数字当前版本；旧数据升级时由补丁补齐。 */
  measurementVersions?: Partial<Record<SampleRound, MeasurementVersion>>
  annotations: Annotation[]
  proposals: RevisionProposal[]
  attachments: Array<{ name: string; type: string; owner: string }>
  comments: Array<{ id: string; author: string; content: string; date: string }>
}
