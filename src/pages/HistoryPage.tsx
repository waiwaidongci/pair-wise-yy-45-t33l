import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import LockOutlineIcon from '@mui/icons-material/LockOutlined'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { adoptServerVersion, clearConflict, rebaseOntoServer, unlockReview } from '../features/developmentSlice'
import { useCommitConclusion } from '../features/useCommitConclusion'
import ConflictDialog from '../components/ConflictDialog'

export default function HistoryPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { commitConclusion, isCommitting } = useCommitConclusion()
  const conflict = useAppSelector((root) => root.development.conflict)

  const pendingAnnotations = sample.annotations.filter((item) => item.status === '待处理').length
  const pendingProposals = sample.proposals.filter((item) => item.status === '待决定').length
  const canLock = pendingAnnotations === 0 && pendingProposals === 0

  const proposalPart = useMemo(() => {
    const map = new Map<string, string>()
    sample.proposals.forEach((proposal) => map.set(proposal.id, proposal.affectedPart))
    return (id: string) => map.get(id) ?? id
  }, [sample.proposals])

  const events = [
    ...sample.annotations.map((item) => ({ date: '2026-09-27', title: `${item.part}批注`, owner: item.author, detail: item.content, status: item.status })),
    ...sample.proposals.map((item) => ({ date: '2026-09-27', title: `${item.affectedPart}改版方案`, owner: item.author, detail: item.content, status: item.status })),
    ...state.decisions.map((item) => ({ date: '今天', title: `方案 ${item.proposalId} ${item.decision}`, owner: '品类负责人', detail: item.reason, status: '已记录' })),
    { date: '2026-09-26', title: '第三轮尺寸实测导入', owner: '苏州明裁制衣', detail: '导入 6 个部位实测值，系统发现 2 项超过容差。', status: '已同步' },
    { date: '2026-09-22', title: '第二轮试穿评审', owner: '陈曼', detail: '完成动态试穿记录，肩袖活动量改善。', status: '已归档' },
  ]

  const handleFreeze = async () => {
    const result = await commitConclusion({
      sample,
      round: state.roundB,
      baselineRound: state.roundA,
      decisions: state.decisions,
      note: state.draftNotes[sample.id] ?? '',
      status: '已冻结',
    })
    if (result.ok) setConfirmOpen(false)
  }

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">AUDIT TRAIL / 修订历史</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · 审核与锁定</Typography>
          <Typography color="text.secondary">每次尺寸调整、批注和替代方案均保留时间、责任人与决定理由；冻结结论只追加、不覆盖。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined">导出修订记录</Button>
          {state.locked ? (
            <Button variant="outlined" startIcon={<LockOpenOutlinedIcon />} onClick={() => dispatch(unlockReview())}>解锁修订</Button>
          ) : (
            <Button variant="contained" startIcon={<LockOutlineIcon />} onClick={() => setConfirmOpen(true)} disabled={!canLock}>审核锁定</Button>
          )}
        </Stack>
      </Box>

      {!canLock && !state.locked && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          审核前需处理 {pendingAnnotations} 项待处理批注和 {pendingProposals} 项待决定改版方案。
        </Alert>
      )}
      {state.locked && <Alert severity="success" sx={{ mb: 1.5 }}>当前轮次已锁定，只能查看历史。解锁后新增调整将另存为新版本，不覆盖冻结版。</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 310px' }, gap: 1.5 }}>
        <Box className="panel" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <HistoryOutlinedIcon color="primary" />
            <Typography fontWeight={800}>完整审计时间线</Typography>
          </Stack>
          <Box>
            {events.map((event, index) => (
              <Box key={`${event.title}-${index}`} sx={{ display: 'grid', gridTemplateColumns: '92px 24px 1fr', gap: 1 }}>
                <Typography color="text.secondary" fontSize={11} pt={0.6}>{event.date}</Typography>
                <Box sx={{ position: 'relative', '&:before': { content: '""', position: 'absolute', left: 8, top: 8, bottom: -8, width: 1, bgcolor: '#d5ddd9' }, '&:after': { content: '""', position: 'absolute', left: 4, top: 7, width: 7, height: 7, bgcolor: '#25756d', border: '2px solid #fff', borderRadius: '50%', boxShadow: '0 0 0 1px #25756d' } }} />
                <Box sx={{ pb: 2.2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={800} fontSize={13}>{event.title}</Typography>
                    <Chip size="small" label={event.status} />
                  </Stack>
                  <Typography color="text.secondary" fontSize={12} mt={0.5}>{event.detail}</Typography>
                  <Typography color="#8a918d" fontSize={10} mt={0.5}>操作者：{event.owner}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Box className="panel" sx={{ alignSelf: 'start' }}>
          <Box sx={{ p: 1.6, borderBottom: '1px solid #ece9e4' }}>
            <Typography fontWeight={800}>轮次摘要</Typography>
          </Box>
          <Stack spacing={1.5} p={1.6}>
            {(['第一轮', '第二轮', '第三轮'] as const).map((round, index) => (
              <Box key={round} sx={{ p: 1.3, border: '1px solid #e4e1dc', borderRadius: 1, bgcolor: round === state.roundB ? '#edf5f2' : '#fff' }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontWeight={800} fontSize={13}>{round}</Typography>
                  <Chip size="small" label={index === 2 ? sample.status : '已归档'} />
                </Stack>
                <Typography color="text.secondary" fontSize={11} mt={0.8}>
                  {sample.measurements[round].length} 项实测 · {index === 2 ? sample.annotations.length : index + 2} 条评审记录
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      <Box className="panel" sx={{ mt: 1.5 }}>
        <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4' }}>
          <Typography fontWeight={800}>版型结论链（冻结版不可变，调整另存新结论）</Typography>
        </Box>
        {sample.conclusions.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography color="text.secondary" fontSize={13}>尚未提交版型结论。提交后将在此按版本保留量体快照、超差部位与认可方案。</Typography>
          </Box>
        ) : (
          <Stack spacing={1.4} sx={{ p: 1.5 }}>
            {[...sample.conclusions].reverse().map((conclusion) => (
              <Box key={conclusion.id} sx={{ p: 1.5, border: '1px solid #e2dfda', borderRadius: 1.2, bgcolor: conclusion.status === '已冻结' ? '#f3f8f6' : '#fff' }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip size="small" label={`v${conclusion.version}`} color="primary" variant="outlined" />
                  <Chip size="small" label={conclusion.status} color={conclusion.status === '已冻结' ? 'success' : 'default'} />
                  <Typography fontWeight={800} fontSize={13}>{conclusion.role} · {conclusion.round}（基准 {conclusion.baselineRound}）</Typography>
                  <Typography color="text.secondary" fontSize={11}>{new Date(conclusion.committedAt).toLocaleString('zh-CN')}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.6} flexWrap="wrap" mt={1}>
                  {conclusion.measurements.map((item) => {
                    const over = Math.abs(item.actual - item.spec) > item.tolerance
                    return (
                      <Chip
                        key={item.key}
                        size="small"
                        variant="outlined"
                        label={`${item.name} ${item.actual.toFixed(1)}${over ? ' 超差' : ''}`}
                        color={over ? 'error' : 'default'}
                      />
                    )
                  })}
                </Stack>
                <Stack direction="row" spacing={0.6} flexWrap="wrap" mt={0.8}>
                  {conclusion.outOfTolerance.length === 0 ? (
                    <Chip size="small" label="全部达标" color="success" />
                  ) : (
                    conclusion.outOfTolerance.map((key) => (
                      <Chip key={key} size="small" label={`超差 ${conclusion.measurements.find((item) => item.key === key)?.name ?? key}`} color="error" />
                    ))
                  )}
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Stack spacing={0.4}>
                  {conclusion.decisions.map((decision) => (
                    <Stack key={decision.proposalId} direction="row" spacing={1} alignItems="center" fontSize={12}>
                      {decision.decision === '已采纳' ? <CheckCircleOutlineIcon fontSize="small" color="success" /> : <CancelOutlinedIcon fontSize="small" color="disabled" />}
                      <Typography fontWeight={700}>{proposalPart(decision.proposalId)}</Typography>
                      <Chip size="small" label={decision.decision} color={decision.decision === '已采纳' ? 'success' : 'default'} />
                      {decision.reason && <Typography color="text.secondary" fontSize={11}>{decision.reason}</Typography>}
                    </Stack>
                  ))}
                </Stack>
                {conclusion.note && <Typography color="text.secondary" fontSize={12} mt={0.8}>备注：{conclusion.note}</Typography>}
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>确认锁定 {state.roundB}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" mb={1.5}>锁定后本轮尺寸、批注和采纳方案将变为只读，并生成不可覆盖的审核快照（新版本结论）。</Typography>
          <TextField fullWidth label="锁定说明" defaultValue={`确认 ${state.roundB} 版型与工艺资料完整，可进入下一阶段。`} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={isCommitting}>取消</Button>
          <Button variant="contained" onClick={handleFreeze} disabled={isCommitting}>确认锁定并提交结论</Button>
        </DialogActions>
      </Dialog>

      <ConflictDialog
        open={Boolean(conflict)}
        conflict={conflict}
        busy={isCommitting}
        onClose={() => dispatch(clearConflict())}
        onAdopt={() => dispatch(adoptServerVersion())}
        onSaveAsNewVersion={async () => {
          if (!conflict) return
          const { serverSample, yourDraft } = conflict
          const rebased = {
            ...serverSample,
            measurements: {
              ...serverSample.measurements,
              [yourDraft.round]: yourDraft.measurements.map((item) => ({ ...item })),
            },
          }
          dispatch(rebaseOntoServer())
          await commitConclusion({
            sample: rebased,
            round: yourDraft.round,
            baselineRound: yourDraft.baselineRound,
            decisions: yourDraft.decisions,
            note: yourDraft.note,
            status: yourDraft.status,
          })
        }}
      />
    </Box>
  )
}
