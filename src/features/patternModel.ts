import type { Measurement, SampleRound } from '../api/types'

/** 按当前量体数字重算超差部位：实测值与规格之差超过容差即超差。 */
export type OutOfTolerancePart = {
  key: string
  name: string
  spec: number
  actual: number
  tolerance: number
  deviation: number
}

export function computeOutOfTolerance(measurements: Measurement[]): OutOfTolerancePart[] {
  return measurements
    .map((item) => ({ ...item, deviation: item.actual - item.spec }))
    .filter((item) => Math.abs(item.deviation) > item.tolerance)
}

/** 版型结论：一条结论 = 一次确认的量体版本 + 超差部位 + 改版办法认可。 */
export type PatternConclusion = {
  id: string
  styleCode: string
  round: SampleRound
  /** 结论所依据的量体结果版本，数字一改旧结论即失效。 */
  measurementVersion: number
  /** 乐观锁版本号，每次成功保存 +1，后到提交必须带对它才能覆盖。 */
  saveVersion: number
  status: '现行' | '已失效' | '已冻结' | '已被后版替代'
  /** 结论来源。 */
  basis: '常规确认' | '量体重算' | '冻结后调整' | '并行确认'
  author: string
  role: string
  note: string
  adoptedProposalIds: string[]
  outOfTolerance: OutOfTolerancePart[]
  createdAt: string
  /** 冻结时保留的不可变快照说明；非冻结结论为 null。 */
  frozenSnapshot: { frozenAt: string; frozenBy: string; note: string } | null
  parentId: string | null
  /** 被哪条后到结论顶替，仅用于审计。 */
  supersededById: string | null
  /** 失效原因（量体结果改动 / 被后版替代）。 */
  invalidReason: string | null
}

export type ConclusionInput = {
  styleCode: string
  round: SampleRound
  measurementVersion: number
  author: string
  role: string
  note: string
  adoptedProposalIds: string[]
  measurements: Measurement[]
  basis?: PatternConclusion['basis']
  parentId?: string | null
}

let seq = 0
export function nextConclusionId(): string {
  seq += 1
  return `PC-${Date.now().toString(36).toUpperCase()}-${seq}`
}

export function nowText(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

/** 由提交内容构造一条结论，超差部位按提交时的量体数字当场算定。 */
export function buildConclusion(
  input: ConclusionInput,
  saveVersion: number,
  createdAt = nowText(),
): PatternConclusion {
  return {
    id: nextConclusionId(),
    styleCode: input.styleCode,
    round: input.round,
    measurementVersion: input.measurementVersion,
    saveVersion,
    status: '现行',
    basis: input.basis ?? '常规确认',
    author: input.author,
    role: input.role,
    note: input.note,
    adoptedProposalIds: [...input.adoptedProposalIds],
    outOfTolerance: computeOutOfTolerance(input.measurements),
    createdAt,
    frozenSnapshot: null,
    parentId: input.parentId ?? null,
    supersededById: null,
    invalidReason: null,
  }
}

export type ConclusionDiffRow = {
  field: string
  ours: string
  theirs: string
  changed: boolean
}

/** 两次保存差在哪：逐字段比对，超差部位集合按名称比较。 */
export function diffConclusions(
  ours: PatternConclusion,
  theirs: PatternConclusion,
  proposalName: (id: string) => string = (id) => id,
): ConclusionDiffRow[] {
  const joinProposals = (ids: string[]) => (ids.length ? ids.map(proposalName).join('、') : '（无）')
  const joinParts = (parts: OutOfTolerancePart[]) =>
    parts.length ? parts.map((item) => `${item.name} ${item.deviation > 0 ? '+' : ''}${item.deviation.toFixed(1)}`).join('、') : '全部达标'
  const rows: Array<[string, string, string]> = [
    ['提交人', ours.author, theirs.author],
    ['角色', ours.role, theirs.role],
    ['量体版本', `v${ours.measurementVersion}`, `v${theirs.measurementVersion}`],
    ['认可改版办法', joinProposals(ours.adoptedProposalIds), joinProposals(theirs.adoptedProposalIds)],
    ['超差部位', joinParts(ours.outOfTolerance), joinParts(theirs.outOfTolerance)],
    ['评审说明', ours.note || '（空）', theirs.note || '（空）'],
  ]
  return rows.map(([field, a, b]) => ({ field, ours: a, theirs: b, changed: a !== b }))
}
