import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Measurement, SampleRound } from '../api/types'
import {
  buildConclusion,
  diffConclusions,
  type ConclusionDiffRow,
  type PatternConclusion,
} from './patternModel'
import {
  PATTERN_STORAGE_KEY,
  getStorage,
  ingestPersisted,
  migrateV1,
  type MigrationStatus,
  type PatternEvent,
  type StorageLike,
} from './patternLegacy'
import { decideProposal, invalidateApprovals, lockReview, unlockReview, updateMeasurement } from './developmentSlice'
import type { RootState } from '../app/store'

export type SubmitPayload = {
  sampleId: string
  styleCode: string
  round: SampleRound
  author: string
  role: string
  note: string
  adoptedProposalIds: string[]
  measurements: Measurement[]
  measurementVersion: number
  /** 提交人本次保存所依据的保存版本（乐观锁）。 */
  baseSaveVersion: number
}

type PendingConflict = {
  sampleId: string
  styleCode: string
  round: SampleRound
  /** 先到且已成立的结论。 */
  winner: PatternConclusion
  /** 后到、被拦下的提交内容。 */
  incoming: SubmitPayload
  expectedSaveVersion: number
  diff: ConclusionDiffRow[]
}

type PatternState = {
  schemaVersion: 2
  conclusions: PatternConclusion[]
  events: PatternEvent[]
  nextSaveVersion: Record<string, number>
  pendingConflict: PendingConflict | null
  migration: MigrationStatus
}

let eventSeq = 0
function nextEventId(): string {
  eventSeq += 1
  return `EV-${Date.now().toString(36)}-${eventSeq}`
}

function nowText(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

export function saveKey(styleCode: string, round: SampleRound): string {
  return `${styleCode}::${round}`
}

function currentSaveVersion(state: PatternState, styleCode: string, round: SampleRound): number {
  const key = saveKey(styleCode, round)
  if (state.nextSaveVersion[key] !== undefined) return state.nextSaveVersion[key]
  const versions = state.conclusions.filter((item) => item.styleCode === styleCode && item.round === round).map((item) => item.saveVersion)
  return versions.length ? Math.max(...versions) : 0
}

function pushEvent(state: PatternState, event: Omit<PatternEvent, 'id' | 'at'>): void {
  state.events.unshift({ id: nextEventId(), at: nowText(), ...event })
}

function findActive(state: PatternState, styleCode: string, round: SampleRound): PatternConclusion | null {
  const list = state.conclusions
    .filter((item) => item.styleCode === styleCode && item.round === round && item.status === '现行')
    .sort((a, b) => b.saveVersion - a.saveVersion)
  return list[0] ?? null
}

function defaultState(): PatternState {
  return {
    schemaVersion: 2,
    conclusions: [],
    events: [],
    nextSaveVersion: {},
    pendingConflict: null,
    migration: { phase: 'idle' },
  }
}

/** 启动 / 重试时读入持久化记录：读不到版本就保全原记录并挂起等待重试。 */
export function createInitialState(storage: StorageLike | null = getStorage()): PatternState {
  if (!storage) return defaultState()
  const ingested = ingestPersisted(storage)
  if (!ingested) return defaultState()

  if (ingested.status.phase === 'idle' && ingested.data) {
    return hydrateRecord(ingested.data, { phase: 'idle' })
  }
  if (ingested.status.phase === 'upgraded' && ingested.data) {
    const state = hydrateRecord(ingested.data, ingested.status)
    const migrated = migrateV1(ingested.data)
    state.conclusions = migrated
    state.nextSaveVersion = deriveSaveVersions(migrated)
    // 已成功消费保全备份，清掉 recovery，避免下次重试又读到旧内容。
    storage.removeItem('garment-pattern-conclusions-recovery')
    pushEvent(state, {
      kind: '数据升级',
      styleCode: '系统',
      message: `检测到 ${migrated.length} 条 v1 版型结论，已按新版结构升级，原字段保留。`,
    })
    return state
  }
  // unversioned / corrupt：原记录已原样备份，默认数据继续运行，等用户重试。
  const state = defaultState()
  state.migration = ingested.status
  pushEvent(state, {
    kind: '旧记录保全',
    styleCode: '系统',
    message: `读不到数据版本（${ingested.status.phase === 'unversioned' || ingested.status.phase === 'corrupt' ? ingested.status.reason : '未知原因'}），原记录已原样保全，等待人工重试。`,
  })
  return state
}

function deriveSaveVersions(conclusions: PatternConclusion[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const item of conclusions) {
    const key = saveKey(item.styleCode, item.round)
    map[key] = Math.max(map[key] ?? 0, item.saveVersion)
  }
  return map
}

function hydrateRecord(data: unknown, migration: MigrationStatus): PatternState {
  const state = defaultState()
  const record = (data ?? {}) as Partial<PatternState>
  state.conclusions = Array.isArray(record.conclusions) ? record.conclusions : []
  state.events = Array.isArray(record.events) ? (record.events as PatternEvent[]) : []
  state.nextSaveVersion = record.nextSaveVersion && typeof record.nextSaveVersion === 'object' ? record.nextSaveVersion : {}
  state.migration = migration
  return state
}

type CommitOptions = {
  /** 并行确认：不顶替先到结论，作为并存的新结论保存。 */
  parallel?: boolean
}

/** 先到成立的提交落点；返回 null 表示成功，否则返回被拦下的冲突。 */
function commit(
  state: PatternState,
  payload: SubmitPayload,
  options: CommitOptions = {},
): PendingConflict | null {
  const { styleCode, round } = payload
  const token = currentSaveVersion(state, styleCode, round)
  const winner = findActive(state, styleCode, round)

  if (!options.parallel && payload.baseSaveVersion !== token) {
    const candidate = buildConclusion(
      {
        styleCode,
        round,
        measurementVersion: payload.measurementVersion,
        author: payload.author,
        role: payload.role,
        note: payload.note,
        adoptedProposalIds: payload.adoptedProposalIds,
        measurements: payload.measurements,
      },
      token + 1,
    )
    if (winner) {
      return {
        sampleId: payload.sampleId,
        styleCode,
        round,
        winner,
        incoming: payload,
        expectedSaveVersion: token,
        diff: diffConclusions(winner, candidate),
      }
    }
  }

  if (!options.parallel) {
    state.conclusions
      .filter((item) => item.styleCode === styleCode && item.round === round && item.status === '现行')
      .forEach((item) => {
        item.status = '已被后版替代'
        item.supersededById = '(待回填)'
        item.invalidReason = '同量体版本下已有后到结论成立'
      })
  }

  const latestFrozen = [...state.conclusions]
    .filter((item) => item.styleCode === styleCode && item.round === round && item.status === '已冻结')
    .sort((a, b) => b.saveVersion - a.saveVersion)[0]

  const conclusion = buildConclusion(
    {
      styleCode,
      round,
      measurementVersion: payload.measurementVersion,
      author: payload.author,
      role: payload.role,
      note: payload.note,
      adoptedProposalIds: payload.adoptedProposalIds,
      measurements: payload.measurements,
      basis: options.parallel ? '并行确认' : latestFrozen ? '冻结后调整' : '常规确认',
      parentId: options.parallel && winner ? winner.id : null,
    },
    token + 1,
  )
  state.conclusions.push(conclusion)
  state.nextSaveVersion[saveKey(styleCode, round)] = token + 1

  if (!options.parallel) {
    state.conclusions
      .filter((item) => item.supersededById === '(待回填)')
      .forEach((item) => {
        item.supersededById = conclusion.id
      })
  }

  pushEvent(state, {
    kind: '结论提交',
    styleCode,
    round,
    message: `${payload.role} ${payload.author} 提交版型结论（量体 v${payload.measurementVersion}，保存 #${conclusion.saveVersion}）${
      options.parallel ? '，作为并行确认另存，未覆盖先到结论' : ''
    }。`,
  })
  return null
}

const slice = createSlice({
  name: 'pattern',
  initialState: createInitialState,
  reducers: {
    /** 量体结果改动：旧认可失效并重算超差部位；冻结那版保持原样。 */
    measurementChanged(
      state,
      action: PayloadAction<{
        sampleId: string
        styleCode: string
        round: SampleRound
        previousVersion: number
        version: number
        changedAt: string
        changedBy: string
        changedParts: string[]
        measurements: Measurement[]
      }>,
    ) {
      const { styleCode, round, previousVersion, version, changedBy, changedParts } = action.payload
      const invalidated = state.conclusions.filter(
        (item) =>
          item.styleCode === styleCode &&
          item.round === round &&
          item.measurementVersion < version &&
          item.status !== '已冻结',
      )
      invalidated.forEach((item) => {
        item.status = '已失效'
        item.invalidReason = `量体结果已从 v${previousVersion} 更新到 v${version}，按旧数字的认可失效`
      })
      const frozenKept = state.conclusions.filter(
        (item) => item.styleCode === styleCode && item.round === round && item.status === '已冻结',
      ).length

      pushEvent(state, {
        kind: '量体改动',
        styleCode,
        round,
        message: `${changedBy} 更新量体结果 v${previousVersion} → v${version}（${changedParts.join('、') || '整体复核'}）：${invalidated.length} 条旧认可失效，超差部位按新数字重算；已冻结的 ${frozenKept} 版保持原样。`,
      })
    },

    /** 常规提交：带对保存版本才成立，带不对则拦下并存冲突，不盖掉对方。 */
    submitConclusion(state, action: PayloadAction<SubmitPayload>) {
      const conflict = commit(state, action.payload)
      if (conflict) state.pendingConflict = conflict
    },

    /** 版师与产品同时确认同一轮：第一笔成立，第二笔进冲突队列比对差异。 */
    simultaneousSubmit(
      state,
      action: PayloadAction<{ first: SubmitPayload; second: SubmitPayload }>,
    ) {
      const { first, second } = action.payload
      commit(state, first)
      const winner = findActive(state, first.styleCode, first.round)
      if (winner) {
        const candidate = buildConclusion(
          {
            styleCode: second.styleCode,
            round: second.round,
            measurementVersion: second.measurementVersion,
            author: second.author,
            role: second.role,
            note: second.note,
            adoptedProposalIds: second.adoptedProposalIds,
            measurements: second.measurements,
          },
          currentSaveVersion(state, second.styleCode, second.round) + 1,
        )
        state.pendingConflict = {
          sampleId: second.sampleId,
          styleCode: second.styleCode,
          round: second.round,
          winner,
          incoming: second,
          expectedSaveVersion: currentSaveVersion(state, second.styleCode, second.round),
          diff: diffConclusions(winner, candidate),
        }
        pushEvent(state, {
          kind: '冲突拦截',
          styleCode: second.styleCode,
          round: second.round,
          message: `${first.role} ${first.author} 与 ${second.role} ${second.author} 同时确认同一轮：${first.author} 先到成立（#${winner.saveVersion}），${second.author} 后到被拦截，等待比对两次保存差异后决定。`,
        })
      }
    },

    /** 处理冲突：放弃后到，或另存为并行新结论，均不覆盖先到结论。 */
    resolveConflict(state, action: PayloadAction<{ mode: '放弃后到' | '另存新结论' }>) {
      const pending = state.pendingConflict
      if (!pending) return
      if (action.payload.mode === '另存新结论') {
        commit(state, { ...pending.incoming, baseSaveVersion: pending.expectedSaveVersion }, { parallel: true })
      } else {
        pushEvent(state, {
          kind: '冲突处理',
          styleCode: pending.styleCode,
          round: pending.round,
          message: `${pending.incoming.role} ${pending.incoming.author} 的后到提交放弃，先到结论 ${pending.winner.id}（#${pending.winner.saveVersion}）保持成立，未被覆盖。`,
        })
      }
      state.pendingConflict = null
    },

    clearConflict(state) {
      state.pendingConflict = null
    },

    /** 冻住当前那版：有现行结论则就地转冻结快照，没有则按当前数字生成冻结结论。 */
    freezeConclusion(
      state,
      action: PayloadAction<{
        sampleId: string
        styleCode: string
        round: SampleRound
        frozenBy: string
        note: string
        measurementVersion: number
        measurements: Measurement[]
      }>,
    ) {
      const { styleCode, round, frozenBy, note, measurementVersion, measurements } = action.payload
      const active = findActive(state, styleCode, round)
      let frozenId: string
      if (active) {
        active.status = '已冻结'
        active.frozenSnapshot = { frozenAt: nowText(), frozenBy, note }
        frozenId = active.id
      } else {
        const token = currentSaveVersion(state, styleCode, round)
        const frozen = buildConclusion(
          {
            styleCode,
            round,
            measurementVersion,
            author: frozenBy,
            role: '审核锁定',
            note,
            adoptedProposalIds: [],
            measurements,
            basis: '常规确认',
          },
          token + 1,
        )
        frozen.status = '已冻结'
        frozen.frozenSnapshot = { frozenAt: nowText(), frozenBy, note }
        state.conclusions.push(frozen)
        state.nextSaveVersion[saveKey(styleCode, round)] = token + 1
        frozenId = frozen.id
      }
      pushEvent(state, {
        kind: '冻结',
        styleCode,
        round,
        message: `${frozenBy} 冻结 ${frozenId}（量体 v${measurementVersion}）：冻结版只读，之后的量体与方案调整另存新结论，不改此版。`,
      })
    },

    unlockConclusion(state, action: PayloadAction<{ styleCode: string; round: SampleRound; by: string }>) {
      pushEvent(state, {
        kind: '解锁',
        styleCode: action.payload.styleCode,
        round: action.payload.round,
        message: `${action.payload.by} 解锁轮次，冻结版保持原样，后续调整将另存新结论。`,
      })
    },

    /** 重试升级：从保全备份重读，成功则并入，读不到版本则继续保全。 */
    loadPersisted(state, action: PayloadAction<PatternState>) {
      state.conclusions = action.payload.conclusions
      state.events = action.payload.events
      state.nextSaveVersion = action.payload.nextSaveVersion
      state.migration = action.payload.migration
      state.pendingConflict = null
    },

    dismissMigration(state) {
      state.migration = { phase: 'dismissed' }
    },
  },
})

/** 改量体数字：更新实测值 → 旧认可失效、超差重算（冻结版除外）→ 旧版师/产品认可打回。 */
export const changeMeasurements = (payload: {
  sampleId: string
  round: SampleRound
  key: string
  actual: number
  changedBy: string
}) => (dispatch: (arg: unknown) => void, getState: () => RootState) => {
  const root = getState()
  const sample = root.development.samples.find((item) => item.id === payload.sampleId)
  if (!sample || sample.status === '已锁定' || root.development.locked) return
  const previous = sample.measurementVersions?.[payload.round]
  const previousVersion = previous?.version ?? 1
  const before = sample.measurements[payload.round].find((item) => item.key === payload.key)
  if (!before || before.actual === payload.actual) return

  dispatch(updateMeasurement({ sampleId: payload.sampleId, round: payload.round, key: payload.key, actual: payload.actual, changedBy: payload.changedBy }))

  const updated = getState().development.samples.find((item) => item.id === payload.sampleId)
  if (!updated) return
  const currentVersion = updated.measurementVersions?.[payload.round]?.version ?? previousVersion + 1

  dispatch(
    slice.actions.measurementChanged({
      sampleId: payload.sampleId,
      styleCode: sample.styleCode,
      round: payload.round,
      previousVersion,
      version: currentVersion,
      changedAt: nowText(),
      changedBy: payload.changedBy,
      changedParts: [before.name],
      measurements: updated.measurements[payload.round],
    }),
  )
  dispatch(
    invalidateApprovals({
      sampleId: payload.sampleId,
      measurementVersion: currentVersion,
      reason: `量体结果 v${previousVersion} → v${currentVersion}：${before.name}实测改动，旧认可失效`,
    }),
  )
}

/** 认可改版方案：盖量体版本号；量体一改，这些认可会被打回重认。 */
export const submitDecisionWorkflow = (payload: {
  proposalId: string
  decision: '已采纳' | '未采纳'
  reason: string
  round: SampleRound
}) => (_dispatch: (arg: unknown) => void, getState: () => RootState) => {
  const root = getState()
  if (root.development.locked) return
  const sample = root.development.samples.find((item) => item.id === root.development.selectedId)
  if (!sample) return
  const version = sample.measurementVersions?.[payload.round]?.version ?? 1
  _dispatch(
    decideProposal({
      proposalId: payload.proposalId,
      decision: payload.decision,
      reason: payload.reason,
      decidedAt: new Date().toLocaleString('zh-CN'),
      sampleId: sample.id,
      round: payload.round,
      measurementVersion: version,
      valid: true,
    }),
  )
}

/** 审核锁定：先冻版型结论快照，再锁轮次。 */
export const freezeAndLock = (payload: { sampleId: string; round: SampleRound; note: string }) =>
  (dispatch: (arg: unknown) => void, getState: () => RootState) => {
    const sample = getState().development.samples.find((item) => item.id === payload.sampleId)
    if (!sample) return
    dispatch(
      slice.actions.freezeConclusion({
        sampleId: payload.sampleId,
        styleCode: sample.styleCode,
        round: payload.round,
        frozenBy: '品类负责人',
        note: payload.note,
        measurementVersion: sample.measurementVersions?.[payload.round]?.version ?? 1,
        measurements: sample.measurements[payload.round],
      }),
    )
    dispatch(lockReview())
  }

export const unlockAndBranch = () => (dispatch: (arg: unknown) => void, getState: () => RootState) => {
  const root = getState()
  const sample = root.development.samples.find((item) => item.id === root.development.selectedId)
  if (!sample) return
  dispatch(unlockReview())
  dispatch(slice.actions.unlockConclusion({ styleCode: sample.styleCode, round: root.development.roundB, by: '品类负责人' }))
}

/** 重试旧数据升级。 */
export const retryLegacyMigration = () => (dispatch: (arg: unknown) => void) => {
  const storage = getStorage()
  if (!storage) return
  const state = createInitialState(storage)
  dispatch(slice.actions.loadPersisted(state))
}

export const { submitConclusion, simultaneousSubmit, resolveConflict, clearConflict, dismissMigration } =
  slice.actions
export const patternReducer = slice.reducer

/* ---------- 选择器 ---------- */

export const selectPattern = (state: RootState) => state.pattern

export function selectConclusions(styleCode: string, round: SampleRound) {
  return (state: RootState) =>
    state.pattern.conclusions
      .filter((item) => item.styleCode === styleCode && item.round === round)
      .sort((a, b) => b.saveVersion - a.saveVersion)
}

export function selectLatestFrozen(styleCode: string, round: SampleRound) {
  return (state: RootState) =>
    state.pattern.conclusions
      .filter((item) => item.styleCode === styleCode && item.round === round && item.status === '已冻结')
      .sort((a, b) => b.saveVersion - a.saveVersion)[0] ?? null
}

export { PATTERN_STORAGE_KEY }
