import type { Sample } from '../api/types'
import type { MigrationInfo } from './conclusion'

const V1_KEY = 'garment-sampling-draft-v1'
const V2_KEY = 'garment-sampling-draft-v2'
const UNRECOVERABLE_KEY = 'garment-sampling-draft-unrecoverable-v1'

export const SCHEMA_VERSION = 2

/** 旧版 v1 样品补齐版本号与结论链，升级到 v2。 */
export function migrateV1Samples(oldSamples: unknown[]): Sample[] {
  return (oldSamples as Record<string, unknown>[]).map((raw) => ({
    ...(raw as Sample),
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? (raw.version as number) : 1,
    conclusions: Array.isArray(raw.conclusions) ? (raw.conclusions as Sample['conclusions']) : [],
  }))
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 读取并升级本地存档。
 * - 读到当前版本 v2：直接使用；
 * - 只读到旧版 v1：兼容升级后写入 v2（原 v1 保留不删）；
 * - 读不到版本号 / 形状不对 / 解析失败：保住原记录（写入 unrecoverable 键），
 *   返回 failed，由界面提示用户重试，绝不静默丢弃。
 */
export function loadPersistedState(): { restored: Record<string, unknown> | null; migration: MigrationInfo } {
  if (typeof localStorage === 'undefined') return { restored: null, migration: { status: 'ok' } }

  const v2Raw = localStorage.getItem(V2_KEY)
  if (v2Raw) {
    const parsed = parseJson(v2Raw)
    if (parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).schemaVersion === SCHEMA_VERSION && Array.isArray((parsed as Record<string, unknown>).samples)) {
      return { restored: parsed as Record<string, unknown>, migration: { status: 'ok' } }
    }
    localStorage.setItem(UNRECOVERABLE_KEY, v2Raw)
    return { restored: null, migration: { status: 'failed', raw: v2Raw, message: '存档版本无法识别，已原样保留原记录。' } }
  }

  const v1Raw = localStorage.getItem(V1_KEY)
  if (v1Raw) {
    const parsed = parseJson(v1Raw)
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).samples)) {
      const upgraded = { ...(parsed as Record<string, unknown>), schemaVersion: SCHEMA_VERSION, samples: migrateV1Samples((parsed as Record<string, unknown>).samples as unknown[]) }
      localStorage.setItem(V2_KEY, JSON.stringify(upgraded))
      return { restored: upgraded, migration: { status: 'ok' } }
    }
    localStorage.setItem(UNRECOVERABLE_KEY, v1Raw)
    return { restored: null, migration: { status: 'failed', raw: v1Raw, message: '旧存档缺少版本信息，已原样保留原记录。' } }
  }

  return { restored: null, migration: { status: 'ok' } }
}

export function retryMigration(): { restored: Record<string, unknown> | null; migration: MigrationInfo } {
  return loadPersistedState()
}

export { V1_KEY, V2_KEY, UNRECOVERABLE_KEY }
