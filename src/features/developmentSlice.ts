import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { seedSamples } from '../api/seed'
import type { Conclusion, Sample } from '../api/types'
import { fingerprint, type ConclusionDraft, type MigrationInfo, type Role, type Round } from './conclusion'
import { loadPersistedState, retryMigration as retryMigrationLoad, SCHEMA_VERSION } from './migration'

export type { Role } from './conclusion'
export const roles: Role[] = ['版师', '产品']

type Decision = {
  proposalId: string
  decision: '已采纳' | '未采纳'
  reason: string
  decidedAt: string
}

type Draft = {
  samples: Sample[]
  decisions: Decision[]
  draftNotes: Record<string, string>
  locked: boolean
  /** 每个样品「最近一次已提交结论」的量体指纹；当前指纹不同即旧认可失效。 */
  committedFingerprints: Record<string, string>
}

export type ConflictInfo = {
  serverSample: Sample
  yourDraft: ConclusionDraft
  serverVersion: number
  yourBaseVersion: number
}

export type VersionIssue = {
  sampleId: string
  yourDraft: ConclusionDraft
  message: string
}

type DevelopmentState = {
  schemaVersion: number
  samples: Sample[]
  selectedId: string
  roundA: Round
  roundB: Round
  decisions: Decision[]
  draftNotes: Record<string, string>
  locked: boolean
  activeAnnotation: string | null
  activeRole: Role
  drafts: Partial<Record<Role, Draft>>
  committedFingerprints: Record<string, string>
  conflict: ConflictInfo | null
  migration: MigrationInfo
  versionIssue: VersionIssue | null
}

function freshSamples(): Sample[] {
  return structuredClone(seedSamples)
}

function freshDraft(): Draft {
  return { samples: freshSamples(), decisions: [], draftNotes: {}, locked: false, committedFingerprints: {} }
}

function buildInitialState(): DevelopmentState {
  const { restored, migration } = loadPersistedState()
  if (restored) {
    return {
      schemaVersion: SCHEMA_VERSION,
      samples: (restored.samples as Sample[]) ?? freshSamples(),
      selectedId: (restored.selectedId as string) ?? seedSamples[0].id,
      roundA: (restored.roundA as Round) ?? '第二轮',
      roundB: (restored.roundB as Round) ?? '第三轮',
      decisions: (restored.decisions as Decision[]) ?? [],
      draftNotes: (restored.draftNotes as Record<string, string>) ?? {},
      locked: (restored.locked as boolean) ?? false,
      activeAnnotation: null,
      activeRole: (restored.activeRole as Role) ?? '版师',
      drafts: (restored.drafts as Partial<Record<Role, Draft>>) ?? {},
      committedFingerprints: (restored.committedFingerprints as Record<string, string>) ?? {},
      conflict: null,
      migration,
      versionIssue: null,
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    samples: freshSamples(),
    selectedId: seedSamples[0].id,
    roundA: '第二轮',
    roundB: '第三轮',
    decisions: [],
    draftNotes: {},
    locked: false,
    activeAnnotation: null,
    activeRole: '版师',
    drafts: {},
    committedFingerprints: {},
    conflict: null,
    migration,
    versionIssue: null,
  }
}

const slice = createSlice({
  name: 'development',
  initialState: buildInitialState(),
  reducers: {
    selectSample(state, action: PayloadAction<string>) {
      state.selectedId = action.payload
      state.activeAnnotation = null
    },
    setRounds(state, action: PayloadAction<{ a?: Round; b?: Round }>) {
      if (action.payload.a) state.roundA = action.payload.a
      if (action.payload.b) state.roundB = action.payload.b
    },
    decideProposal(state, action: PayloadAction<Decision>) {
      const sample = state.samples.find((item) => item.id === state.selectedId)
      if (!sample || state.locked) return
      state.decisions.push(action.payload)
      const proposal = sample.proposals.find((item) => item.id === action.payload.proposalId)
      if (proposal) proposal.status = action.payload.decision
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
    updateMeasurement(state, action: PayloadAction<{ sampleId: string; round: Round; key: string; actual: number }>) {
      const sample = state.samples.find((item) => item.id === action.payload.sampleId)
      if (!sample) return
      const target = sample.measurements[action.payload.round].find((item) => item.key === action.payload.key)
      if (target) target.actual = action.payload.actual
    },
    switchRole(state, action: PayloadAction<Role>) {
      if (action.payload === state.activeRole) return
      state.drafts[state.activeRole] = {
        samples: state.samples,
        decisions: state.decisions,
        draftNotes: state.draftNotes,
        locked: state.locked,
        committedFingerprints: state.committedFingerprints,
      }
      const next = state.drafts[action.payload] ?? freshDraft()
      state.samples = next.samples
      state.decisions = next.decisions
      state.draftNotes = next.draftNotes
      state.locked = next.locked
      state.committedFingerprints = next.committedFingerprints
      state.activeRole = action.payload
      state.conflict = null
      state.versionIssue = null
    },
    commitSucceeded(state, action: PayloadAction<{ sample: Sample; conclusion: Conclusion }>) {
      const index = state.samples.findIndex((item) => item.id === action.payload.sample.id)
      if (index >= 0) state.samples[index] = action.payload.sample
      else state.samples.push(action.payload.sample)
      state.committedFingerprints[action.payload.sample.id] = fingerprint(action.payload.conclusion.measurements)
      if (action.payload.conclusion.status === '已冻结') state.locked = true
      state.conflict = null
      state.versionIssue = null
    },
    conflictDetected(state, action: PayloadAction<ConflictInfo>) {
      state.conflict = action.payload
    },
    clearConflict(state) {
      state.conflict = null
    },
    adoptServerVersion(state) {
      const conflict = state.conflict
      if (!conflict) return
      const index = state.samples.findIndex((item) => item.id === conflict.serverSample.id)
      if (index >= 0) state.samples[index] = conflict.serverSample
      const latest = conflict.serverSample.conclusions[conflict.serverSample.conclusions.length - 1]
      if (latest) {
        state.committedFingerprints[conflict.serverSample.id] = fingerprint(latest.measurements)
        state.decisions = latest.decisions.map((item) => ({
          proposalId: item.proposalId,
          decision: item.decision,
          reason: item.reason,
          decidedAt: item.decidedAt,
        }))
      }
      state.conflict = null
    },
    rebaseOntoServer(state) {
      // 另存为新版本：以服务器最新版为底，保留我方量体与决定，随后按新版本号重新提交，绝不覆盖对方。
      const conflict = state.conflict
      if (!conflict) return
      const index = state.samples.findIndex((item) => item.id === conflict.serverSample.id)
      const rebased: Sample = {
        ...conflict.serverSample,
        measurements: {
          ...conflict.serverSample.measurements,
          [conflict.yourDraft.round]: conflict.yourDraft.measurements.map((item) => ({ ...item })),
        },
      }
      if (index >= 0) state.samples[index] = rebased
      else state.samples.push(rebased)
      state.decisions = conflict.yourDraft.decisions.map((item) => ({ ...item }))
      state.conflict = null
    },
    versionUnreadable(state, action: PayloadAction<VersionIssue>) {
      state.versionIssue = action.payload
      // 读不到版本：保住原记录，samples 与 decisions 一律不动。
    },
    clearVersionIssue(state) {
      state.versionIssue = null
    },
    retryMigration(state) {
      const { restored, migration } = retryMigrationLoad()
      state.migration = migration
      if (restored) {
        state.samples = (restored.samples as Sample[]) ?? state.samples
        state.selectedId = (restored.selectedId as string) ?? state.selectedId
        state.roundA = (restored.roundA as Round) ?? state.roundA
        state.roundB = (restored.roundB as Round) ?? state.roundB
        state.decisions = (restored.decisions as Decision[]) ?? state.decisions
        state.draftNotes = (restored.draftNotes as Record<string, string>) ?? state.draftNotes
        state.locked = (restored.locked as boolean) ?? state.locked
        state.activeRole = (restored.activeRole as Role) ?? state.activeRole
        state.drafts = (restored.drafts as Partial<Record<Role, Draft>>) ?? state.drafts
        state.committedFingerprints = (restored.committedFingerprints as Record<string, string>) ?? state.committedFingerprints
      }
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
  saveDraft,
  toggleAnnotation,
  resolveAnnotation,
  updateMeasurement,
  switchRole,
  commitSucceeded,
  conflictDetected,
  clearConflict,
  adoptServerVersion,
  rebaseOntoServer,
  versionUnreadable,
  clearVersionIssue,
  retryMigration,
  unlockReview,
} = slice.actions
export const developmentReducer = slice.reducer
