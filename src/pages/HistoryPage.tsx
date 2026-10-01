import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import LockOutlineIcon from '@mui/icons-material/LockOutlined'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { selectConclusions, freezeAndLock, unlockAndBranch } from '../features/patternSlice'

const eventStyle: Record<string, string> = {
  量体改动: '#b44b2d',
  结论提交: '#25756d',
  结论失效: '#b44b2d',
  冲突拦截: '#b65e35',
  冲突处理: '#8a6d3b',
  冻结: '#4a6fa5',
  解锁: '#6d7a8a',
  数据升级: '#25756d',
  旧记录保全: '#b44b2d',
}

export default function HistoryPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const pattern = useAppSelector((root) => root.pattern)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lockNote, setLockNote] = useState(`确认 ${state.roundB} 版型与工艺资料完整，可进入下一阶段。`)
  const pendingAnnotations = sample.annotations.filter((item) => item.status === '待处理').length
  const pendingProposals = sample.proposals.filter((item) => item.status === '待决定').length
  const canLock = pendingAnnotations === 0 && pendingProposals === 0
  const conclusions = useAppSelector(selectConclusions(sample.styleCode, state.roundB))

  const staticEvents = [
    ...sample.annotations.map((item) => ({ date: '2026-09-27', title: `${item.part}批注`, owner: item.author, detail: item.content, status: item.status })),
    ...sample.proposals.map((item) => ({ date: '2026-09-27', title: `${item.affectedPart}改版方案`, owner: item.author, detail: item.content, status: item.status })),
    ...state.decisions.map((item) => ({
      date: '今天',
      title: `方案 ${item.proposalId} ${item.decision}${item.valid === false ? '（已失效）' : ''}`,
      owner: '品类负责人',
      detail: item.valid === false ? `${item.invalidReason ?? '旧认可失效'}｜原理由：${item.reason}` : item.reason,
      status: item.valid === false ? '已失效' : '已记录',
    })),
  ]

  const patternEvents = pattern.events
    .filter((item) => item.styleCode === sample.styleCode || item.styleCode === '系统')
    .map((item) => ({ date: item.at, title: `${item.kind}${item.round ? ` · ${item.round}` : ''}`, owner: '版型结论链', detail: item.message, status: item.kind, tone: eventStyle[item.kind] ?? '#25756d' }))

  const events = [...patternEvents.map((item) => ({ ...item, date: item.date })), ...staticEvents]

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">AUDIT TRAIL / 修订历史</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · 审核与冻结</Typography>
          <Typography color="text.secondary">量体改动、结论提交、冲突处理和冻结快照均保留时间、责任人与原因；冻结版只读不可覆盖。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined">导出修订记录</Button>
          {state.locked ? (
            <Button variant="outlined" startIcon={<LockOpenOutlinedIcon />} onClick={() => dispatch(unlockAndBranch())}>解锁并另开分支</Button>
          ) : (
            <Button variant="contained" startIcon={<LockOutlineIcon />} onClick={() => setConfirmOpen(true)} disabled={!canLock}>审核冻结</Button>
          )}
        </Stack>
      </Box>

      {!canLock && !state.locked && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          审核前需处理 {pendingAnnotations} 项待处理批注和 {pendingProposals} 项待决定改版方案。
        </Alert>
      )}
      {state.locked && <Alert severity="success" sx={{ mb: 1.5 }}>当前轮次已冻结，只能查看历史。解锁会另开修订分支，冻结版保持原样。</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 320px' }, gap: 1.5 }}>
        <Box className="panel" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <HistoryOutlinedIcon color="primary" />
            <Typography fontWeight={800}>完整审计时间线</Typography>
          </Stack>
          <Box>
            {events.map((event, index) => (
              <Box key={`${event.title}-${index}`} sx={{ display: 'grid', gridTemplateColumns: { xs: '120px', sm: '150px' }, gap: { xs: 0.5, sm: 1 }, gridTemplateRows: '24px 1fr' }}>
                <Typography color="text.secondary" fontSize={11} pt={0.6} sx={{ gridColumn: 1 }}>{event.date}</Typography>
                <Box sx={{ gridColumn: 2, position: 'relative', '&:before': { content: '""', position: 'absolute', left: 8, top: 8, bottom: -8, width: 1, bgcolor: '#d5ddd9' }, '&:after': { content: '""', position: 'absolute', left: 4, top: 7, width: 7, height: 7, bgcolor: (event as { tone?: string }).tone ?? '#25756d', border: '2px solid #fff', borderRadius: '50%', boxShadow: `0 0 0 1px ${(event as { tone?: string }).tone ?? '#25756d'}` } }} />
                <Box sx={{ gridColumn: 2, pb: 2.2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={800} fontSize={13}>{event.title}</Typography>
                    <Chip size="small" label={event.status} color={event.status === '已失效' ? 'error' : event.status === '冻结' ? 'info' : 'default'} />
                  </Stack>
                  <Typography color="text.secondary" fontSize={12} mt={0.5}>{event.detail}</Typography>
                  <Typography color="#8a918d" fontSize={10} mt={0.5}>操作者：{event.owner}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Stack spacing={1.5}>
          <Box className="panel" sx={{ alignSelf: 'start' }}>
            <Box sx={{ p: 1.6, borderBottom: '1px solid #ece9e4' }}>
              <Typography fontWeight={800}>版型结论链 · {state.roundB}</Typography>
            </Box>
            <Stack spacing={1.2} p={1.6}>
              {conclusions.length === 0 && <Typography color="text.secondary" fontSize={12}>尚无结论，冻结时若无现行结论将按当前量体数字自动生成。</Typography>}
              {conclusions.map((item) => (
                <Box key={item.id} sx={{ p: 1.2, border: '1px solid #e4e1dc', borderLeft: `3px solid ${item.status === '已冻结' ? '#4a6fa5' : '#25756d'}`, borderRadius: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={800} fontSize={12}>#{item.saveVersion} {item.basis}</Typography>
                    <Chip size="small" color={item.status === '已冻结' ? 'info' : item.status === '现行' ? 'success' : item.status === '已失效' ? 'error' : 'default'} label={item.status} />
                  </Stack>
                  <Typography color="text.secondary" fontSize={11} mt={0.6}>
                    量体 v{item.measurementVersion} · {item.author} · 超差 {item.outOfTolerance.length} 项
                  </Typography>
                  {item.frozenSnapshot && <Typography fontSize={11} color="#4a6fa5" mt={0.4}>冻结快照只读，后调另存。</Typography>}
                </Box>
              ))}
            </Stack>
          </Box>

          <Box className="panel" sx={{ alignSelf: 'start' }}>
            <Box sx={{ p: 1.6, borderBottom: '1px solid #ece9e4' }}>
              <Typography fontWeight={800}>轮次摘要</Typography>
            </Box>
            <Stack spacing={1.5} p={1.6}>
              {(['第一轮', '第二轮', '第三轮'] as const).map((round, index) => {
                const mv = sample.measurementVersions?.[round]?.version ?? 1
                return (
                  <Box key={round} sx={{ p: 1.3, border: '1px solid #e4e1dc', borderRadius: 1, bgcolor: round === state.roundB ? '#edf5f2' : '#fff' }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography fontWeight={800} fontSize={13}>{round}</Typography>
                      <Chip size="small" label={index === 2 ? sample.status : '已归档'} />
                    </Stack>
                    <Typography color="text.secondary" fontSize={11} mt={0.8}>
                      量体 v{mv} · {sample.measurements[round].length} 项实测 · {index === 2 ? sample.annotations.length : index + 2} 条评审记录
                    </Typography>
                  </Box>
                )
              })}
            </Stack>
          </Box>
        </Stack>
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>确认冻结 {state.roundB}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" mb={1.5}>冻结后本轮量体数字、批注和采纳方案变为只读，并生成不可覆盖的结论快照；之后任何调整都另存新结论。</Typography>
          <TextField fullWidth multiline minRows={2} label="冻结说明" value={lockNote} onChange={(event) => setLockNote(event.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => {
              dispatch(freezeAndLock({ sampleId: sample.id, round: state.roundB, note: lockNote }))
              setConfirmOpen(false)
            }}
          >
            确认冻结
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
