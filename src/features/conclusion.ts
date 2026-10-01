import type { Conclusion, ConclusionDecision, Measurement, Role, Sample } from '../api/types'

export type { Role }
export const ROUNDS = ['第一轮', '第二轮', '第三轮'] as const
export type Round = (typeof ROUNDS)[number]

export type MigrationInfo = {
  status: 'ok' | 'failed'
  raw?: string
  message?: string
}

export type DecisionInput = {
  proposalId: string
  decision: '已采纳' | '未采纳'
  reason: string
  decidedAt: string
}

/** 按量体数字重算超差部位：|实测 - 规格| > 容差 即为超差。 */
export function recomputeOutOfTolerance(measurements: Measurement[]): string[] {
  return measurements.filter((item) => Math.abs(item.actual - item.spec) > item.tolerance).map((item) => item.key)
}

/** 量体指纹：用于判断「量体结果是否有改动」，改动则旧认可失效。 */
export function fingerprint(measurements: Measurement[]): string {
  return measurements.map((item) => `${item.key}:${item.actual}`).join('|')
}

export type ConclusionDraft = {
  round: Round
  baselineRound: Round
  role: Role
  measurements: Measurement[]
  outOfTolerance: string[]
  decisions: ConclusionDecision[]
  note: string
  status: '已确认' | '已冻结'
}

export function buildConclusionDraft(args: {
  round: Round
  baselineRound: Round
  role: Role
  measurements: Measurement[]
  decisions: DecisionInput[]
  note: string
  status: '已确认' | '已冻结'
}): ConclusionDraft {
  return {
    round: args.round,
    baselineRound: args.baselineRound,
    role: args.role,
    measurements: args.measurements.map((item) => ({ ...item })),
    outOfTolerance: recomputeOutOfTolerance(args.measurements),
    decisions: args.decisions.map((item) => ({ ...item })),
    note: args.note,
    status: args.status,
  }
}

/**
 * 把已提交的结论应用到样品上（不可变更新）：
 * - 结论链只追加，已有结论（含冻结版）绝不被改写；
 * - 样品版本号跳到结论版本号；
 * - 量体快照同步到对应轮次，方案状态按结论落定。
 */
export function applyConclusionToSample(sample: Sample, conclusion: Conclusion): Sample {
  return {
    ...sample,
    version: conclusion.version,
    status: conclusion.status === '已冻结' ? '已锁定' : sample.status,
    conclusions: [...sample.conclusions, conclusion],
    measurements: {
      ...sample.measurements,
      [conclusion.round]: conclusion.measurements.map((item) => ({ ...item })),
    },
    proposals: sample.proposals.map((proposal) => {
      const decision = conclusion.decisions.find((item) => item.proposalId === proposal.id)
      return decision ? { ...proposal, status: decision.decision } : proposal
    }),
  }
}

/** 从样品当前状态抽取结论决定；优先采用明确决定，其次方案现状；冻结时未决定的方案视为未采纳，保证快照完整。 */
export function decisionsForConclusion(
  sample: Sample,
  decisions: DecisionInput[],
  status: '已确认' | '已冻结',
): ConclusionDecision[] {
  return sample.proposals
    .filter((proposal) => status === '已冻结' || proposal.status !== '待决定' || decisions.some((item) => item.proposalId === proposal.id))
    .map((proposal) => {
      const explicit = decisions.find((item) => item.proposalId === proposal.id)
      const decision: '已采纳' | '未采纳' = explicit ? explicit.decision : proposal.status === '已采纳' ? '已采纳' : '未采纳'
      return {
        proposalId: proposal.id,
        decision,
        reason: explicit?.reason ?? (status === '已冻结' ? '锁定时未处理，视为未采纳' : ''),
        decidedAt: explicit?.decidedAt ?? '',
      }
    })
}
