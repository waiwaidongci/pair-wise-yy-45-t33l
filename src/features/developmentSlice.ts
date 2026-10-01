import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { seedSamples } from '../api/seed'
import { sampleRounds, type MeasurementVersion, type Sample, type SampleRound } from '../api/types'

export type Decision = {
  proposalId: string
  decision: '已采纳' | '未采纳'
  reason: string
  decidedAt: string
  /** 该认可依据的量体版本；量体一改，低于新版本的认可自动失效。 */
  sampleId?: string
  round?: SampleRound
  measurementVersion?: number
  valid?: boolean
  invalidReason?: string | null
}

type DevelopmentState = {
  samples: Sample[]
  selectedId: string
  roundA: SampleRound
  roundB: SampleRound
  decisions: Decision[]
  draftNotes: Record<string, string>
  locked: boolean
  activeAnnotation: string | null
}

const storageKey = 'garment-sampling-draft-v1'
const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null

function initialMeasurementVersion(): MeasurementVersion {
  return { version: 1, changedAt: '初始量体导入', changedBy: '系统', changedParts: [] }
}

/** 给旧数据补齐量体版本字段，保证升级前后都能读到记录。 */
function normalizeSample(sample: Sample): Sample {
  const measurementVersions: Sample['measurementVersions'] = { ...(sample.measurementVersions ?? {}) }
  sampleRounds.forEach((round) => {
    if (!measurementVersions[round]) {
      measurementVersions[round] = initialMeasurementVersion()
    }
  })
  return { ...sample, measurementVersions }
}

function normalizeState(state: Partial<DevelopmentState>): DevelopmentState {
  return {
    samples: (state.samples ?? structuredClone(seedSamples)).map(normalizeSample),
    selectedId: state.selectedId ?? seedSamples[0].id,
    roundA: state.roundA ?? '第二轮',
    roundB: state.roundB ?? '第三轮',
    decisions: (state.decisions ?? []).map((item) => ({ valid: true, invalidReason: null, ...item })),
    draftNotes: state.draftNotes ?? {},
    locked: state.locked ?? false,
    activeAnnotation: state.activeAnnotation ?? null,
  }
}

const initialState: DevelopmentState = saved ? normalizeState(JSON.parse(saved) as Partial<DevelopmentState>) : normalizeState({})

const slice = createSlice({
  name: 'development',
  initialState,
  reducers: {
    selectSample(state, action: PayloadAction<string>) {
      state.selectedId = action.payload
      state.activeAnnotation = null
    },
    setRounds(state, action: PayloadAction<{ a?: DevelopmentState['roundA']; b?: DevelopmentState['roundB'] }>) {
      if (action.payload.a) state.roundA = action.payload.a
      if (action.payload.b) state.roundB = action.payload.b
    },
    decideProposal(state, action: PayloadAction<Decision>) {
      const sample = state.samples.find((item) => item.id === (action.payload.sampleId ?? state.selectedId))
      if (!sample || state.locked) return
      state.decisions.push({ valid: true, invalidReason: null, ...action.payload })
      const proposal = sample.proposals.find((item) => item.id === action.payload.proposalId)
      if (proposal && action.payload.valid !== false) proposal.status = action.payload.decision
    },
    /** 量体数字改动：写入新实测值并把该轮量体版本 +1。 */
    updateMeasurement(
      state,
      action: PayloadAction<{ sampleId: string; round: SampleRound; key: string; actual: number; changedBy: string }>,
    ) {
      const sample = state.samples.find((item) => item.id === action.payload.sampleId)
      if (!sample || sample.status === '已锁定' || state.locked) return
      const target = sample.measurements[action.payload.round].find((item) => item.key === action.payload.key)
      if (!target) return
      target.actual = action.payload.actual
      const previous = sample.measurementVersions?.[action.payload.round] ?? initialMeasurementVersion()
      const versions = { ...(sample.measurementVersions ?? {}) }
      versions[action.payload.round] = {
        version: previous.version + 1,
        changedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        changedBy: action.payload.changedBy,
        changedParts: Array.from(new Set([...previous.changedParts, target.name])),
      }
      sample.measurementVersions = versions
    },
    /** 量体改动后，把依据旧数字的认可打回待重新确认（冻结锁定时不触发）。 */
    invalidateApprovals(
      state,
      action: PayloadAction<{ sampleId: string; measurementVersion: number; reason: string }>,
    ) {
      if (state.locked) return
      const sample = state.samples.find((item) => item.id === action.payload.sampleId)
      if (!sample) return
      state.decisions.forEach((decision) => {
        if (
          decision.sampleId === sample.id &&
          decision.valid !== false &&
          (decision.measurementVersion ?? 1) < action.payload.measurementVersion
        ) {
          decision.valid = false
          decision.invalidReason = action.payload.reason
          if (decision.decision === '已采纳') {
            const proposal = sample.proposals.find((item) => item.id === decision.proposalId)
            if (proposal && proposal.status === '已采纳') proposal.status = '待决定'
          }
        }
      })
    },
    saveDraft(state, action: PayloadAction<{ sampleId: string; notes: string }>) {
      state.draftNotes[action.payload.sampleId] = action.payload.notes
    },
    toggleAnnotation(state, action: PayloadAction<string | null>) {
      state.activeAnnotation = action.payload
    },
    resolveAnnotation(state, action: PayloadAction<{ sampleId: string; annotationId: string }>) {
      const sample = state.samples.find((item) => item.id === action.payload.sampleId)
      const annotation = sample?.annotations.find((item) => item.id === action.payload.annotationId)
      if (annotation) annotation.status = annotation.status === '待处理' ? '已解决' : '待处理'
    },
    lockReview(state) {
      const sample = state.samples.find((item) => item.id === state.selectedId)
      if (!sample) return
      sample.status = '已锁定'
      sample.proposals.forEach((proposal) => {
        if (proposal.status === '待决定') proposal.status = '未采纳'
      })
      state.locked = true
    },
    unlockReview(state) {
      const sample = state.samples.find((item) => item.id === state.selectedId)
      if (sample) sample.status = '待审核'
      state.locked = false
    },
  },
})

export const {
  selectSample,
  setRounds,
  decideProposal,
  updateMeasurement,
  invalidateApprovals,
  saveDraft,
  toggleAnnotation,
  resolveAnnotation,
  lockReview,
  unlockReview,
} = slice.actions
export const developmentReducer = slice.reducer
