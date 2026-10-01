import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { useCommitConclusionMutation } from '../app/api'
import type { Sample } from '../api/types'
import {
  applyConclusionToSample,
  buildConclusionDraft,
  decisionsForConclusion,
  type ConclusionDraft,
  type DecisionInput,
  type Round,
} from './conclusion'
import {
  commitSucceeded,
  conflictDetected,
  versionUnreadable,
} from './developmentSlice'

type CommitArgs = {
  sample: Sample
  round: Round
  baselineRound: Round
  decisions: DecisionInput[]
  note: string
  status: '已确认' | '已冻结'
}

type CommitResult =
  | { ok: true; local?: boolean }
  | { ok: false; reason: 'conflict' | 'version_unreadable' | 'error' }

/**
 * 提交版型结论（乐观锁）。
 * - 成功：写入服务器返回的最新样品与结论；
 * - 409 conflict：先到的成立，弹出两次保存差异，由用户选择采用对方或另存新版本；
 * - 409 version_unreadable：读不到版本，保住原记录，提示重试；
 * - 其他错误：本地兜底提交，保证演示可用。
 */
export function useCommitConclusion() {
  const dispatch = useAppDispatch()
  const activeRole = useAppSelector((state) => state.development.activeRole)
  const [commit, { isLoading }] = useCommitConclusionMutation()

  const commitConclusion = useCallback(
    async (args: CommitArgs): Promise<CommitResult> => {
      const { sample, round, baselineRound, decisions, note, status } = args
      const draft: ConclusionDraft = buildConclusionDraft({
        round,
        baselineRound,
        role: activeRole,
        measurements: sample.measurements[round],
        decisions: decisionsForConclusion(sample, decisions, status),
        note,
        status,
      })

      try {
        const response = await commit({
          sampleId: sample.id,
          baseVersion: sample.version,
          role: activeRole,
          conclusion: draft,
        }).unwrap()
        dispatch(commitSucceeded({ sample: response.sample, conclusion: response.conclusion }))
        return { ok: true }
      } catch (error) {
        const data = (error as { data?: { conflict?: boolean; error?: string; message?: string; current?: Sample; serverVersion?: number; yourBaseVersion?: number } })?.data
        if (data?.conflict && data.current) {
          dispatch(
            conflictDetected({
              serverSample: data.current,
              yourDraft: draft,
              serverVersion: data.serverVersion ?? data.current.version,
              yourBaseVersion: data.yourBaseVersion ?? sample.version,
            }),
          )
          return { ok: false, reason: 'conflict' }
        }
        if (data?.error === 'version_unreadable') {
          dispatch(versionUnreadable({ sampleId: sample.id, yourDraft: draft, message: data.message ?? '保存缺少版本号，原记录未改动，请重试。' }))
          return { ok: false, reason: 'version_unreadable' }
        }
        // 本地兜底：网络异常时仍按版本号提交到本地，保证可用。
        const local = applyConclusionToSample(sample, {
          ...draft,
          id: `CC-local-${Date.now()}`,
          version: sample.version + 1,
          committedAt: new Date().toISOString(),
        })
        dispatch(commitSucceeded({ sample: local, conclusion: local.conclusions[local.conclusions.length - 1] }))
        return { ok: true, local: true }
      }
    },
    [commit, dispatch, activeRole],
  )

  return { commitConclusion, isCommitting: isLoading }
}
