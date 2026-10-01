/**
 * 旧数据升级兼容：
 * - 带 schemaVersion 的旧版结构可整体升级，不丢字段；
 * - 读不到版本号或内容损坏时，绝不丢弃原记录：原样备份到 recovery 键，
 *   应用以默认数据继续运行，并把原始内容交还用户重试；
 * - 重试时先读 recovery 键再读主存储键，恢复成功后正常升级。
 */

export const PATTERN_STORAGE_KEY = 'garment-pattern-conclusions-v2'
const LEGACY_PATTERN_KEY = 'garment-pattern-conclusions-v1'
const RECOVERY_KEY = 'garment-pattern-conclusions-recovery'

export type PatternEvent = {
  id: string
  kind: '量体改动' | '结论提交' | '结论失效' | '冲突拦截' | '冲突处理' | '冻结' | '解锁' | '数据升级' | '旧记录保全'
  styleCode: string
  round?: string
  message: string
  at?: string
}

export type MigrationStatus =
  | { phase: 'idle' }
  | { phase: 'upgraded'; from: 1; message: string }
  | { phase: 'unversioned'; raw: string; reason: string; recoveredFrom: 'main' | 'backup' }
  | { phase: 'corrupt'; raw: string; reason: string; recoveredFrom: 'main' | 'backup' }
  | { phase: 'dismissed' }

export type IngestResult = {
  data: unknown
  status: MigrationStatus
}

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function getStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** 找到候选原始记录：重试场景下 recovery 键优先，其次主存储键、旧版键。 */
export function locateRaw(storage: StorageLike): { key: string; raw: string } | null {
  for (const key of [RECOVERY_KEY, PATTERN_STORAGE_KEY, LEGACY_PATTERN_KEY]) {
    const raw = storage.getItem(key)
    if (raw !== null && raw.trim() !== '') return { key, raw }
  }
  return null
}

function preserveRaw(storage: StorageLike, raw: string): void {
  storage.setItem(RECOVERY_KEY, raw)
  // 主存储让位给保全记录，避免应用继续读到无法识别版本的内容。
  if (storage.getItem(PATTERN_STORAGE_KEY) !== null) storage.removeItem(PATTERN_STORAGE_KEY)
}

/**
 * 读入持久化内容。任何无法识别版本的内容都会被原样保全，返回的 status
 * 驱动页面上的“保住原记录 + 重试”提示。
 */
export function ingestPersisted(storage: StorageLike): IngestResult | null {
  const located = locateRaw(storage)
  if (!located) return null
  const { raw } = located
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    preserveRaw(storage, raw)
    return {
      data: null,
      status: { phase: 'corrupt', raw, reason: error instanceof Error ? error.message : 'JSON 解析失败', recoveredFrom: 'backup' },
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    preserveRaw(storage, raw)
    return {
      data: null,
      status: { phase: 'corrupt', raw, reason: '顶层不是对象', recoveredFrom: 'backup' },
    }
  }
  const record = parsed as Record<string, unknown>
  if (record.schemaVersion === 2) return { data: parsed, status: { phase: 'idle' } }
  if (record.schemaVersion === 1) return { data: parsed, status: { phase: 'upgraded', from: 1, message: 'v1 版型结论数据已按新版结构升级。' } }
  // 读不到版本号：不猜、不弃，保住原记录让人重试。
  preserveRaw(storage, raw)
  return {
    data: null,
    status: { phase: 'unversioned', raw, reason: '记录中缺少 schemaVersion 字段', recoveredFrom: 'backup' },
  }
}

/** v1 结构（容错读取，缺字段以空值兜底）。 */
type LegacyV1 = {
  conclusions?: Array<Record<string, unknown>>
  events?: PatternEvent[]
  nextSave?: Record<string, number>
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** 把读得到版本号的旧版记录升级成 v2；读不到的交给保全流程，不在这里处理。 */
export function migrateV1(legacy: unknown): import('./patternModel').PatternConclusion[] {
  const record = (legacy ?? {}) as LegacyV1
  return (record.conclusions ?? []).map((item) => ({
    id: asString(item.id, `PC-LEGACY-${Math.random().toString(36).slice(2, 8)}`),
    styleCode: asString(item.styleCode),
    round: (['第一轮', '第二轮', '第三轮'] as const).includes(asString(item.round) as '第一轮')
      ? (asString(item.round) as '第一轮' | '第二轮' | '第三轮')
      : '第三轮',
    measurementVersion: asNumber(item.measurementVersion, 1),
    saveVersion: asNumber(item.saveVersion, 1),
    status: (['现行', '已失效', '已冻结', '已被后版替代'].includes(asString(item.status) as string)
      ? asString(item.status)
      : '现行') as import('./patternModel').PatternConclusion['status'],
    basis: (['常规确认', '量体重算', '冻结后调整', '并行确认'].includes(asString(item.basis) as string)
      ? asString(item.basis)
      : '常规确认') as import('./patternModel').PatternConclusion['basis'],
    author: asString(item.author, '旧版用户'),
    role: asString(item.role, '未记录'),
    note: asString(item.note),
    adoptedProposalIds: asStringArray(item.adoptedProposalIds),
    outOfTolerance: Array.isArray(item.outOfTolerance) ? (item.outOfTolerance as never) : [],
    createdAt: asString(item.createdAt, '升级前记录'),
    frozenSnapshot:
      item.frozenSnapshot && typeof item.frozenSnapshot === 'object'
        ? (item.frozenSnapshot as import('./patternModel').PatternConclusion['frozenSnapshot'])
        : null,
    parentId: typeof item.parentId === 'string' ? item.parentId : null,
    supersededById: typeof item.supersededById === 'string' ? item.supersededById : null,
    invalidReason: typeof item.invalidReason === 'string' ? item.invalidReason : null,
  }))
}
