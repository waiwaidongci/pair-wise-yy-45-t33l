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
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined'
import PhotoCameraBackOutlinedIcon from '@mui/icons-material/PhotoCameraBackOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { saveDraft, setRounds, toggleAnnotation } from '../features/developmentSlice'
import {
  changeMeasurements,
  clearConflict,
  resolveConflict,
  selectConclusions,
  simultaneousSubmit,
  submitConclusion,
  submitDecisionWorkflow,
  type SubmitPayload,
} from '../features/patternSlice'
import type { Measurement } from '../api/types'

const rounds = ['第一轮', '第二轮', '第三轮'] as const
const roles = [
  { value: '版师', label: '版师' },
  { value: '产品开发', label: '产品开发' },
]

const statusColor: Record<string, 'success' | 'error' | 'info' | 'warning' | 'default'> = {
  现行: 'success',
  已冻结: 'info',
  已失效: 'error',
  已被后版替代: 'default',
}

export default function SampleReviewPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const pattern = useAppSelector((root) => root.pattern)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [decisionDialog, setDecisionDialog] = useState<string | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [annotationDraft, setAnnotationDraft] = useState({ x: 50, y: 42, part: '版型', content: '' })
  const [measureTarget, setMeasureTarget] = useState<Measurement | null>(null)
  const [measureValue, setMeasureValue] = useState('')
  const [measureBy, setMeasureBy] = useState('周研')
  const [role, setRole] = useState('版师')
  const [conclusionNote, setConclusionNote] = useState('')
  const [adopted, setAdopted] = useState<string[]>([])

  const measurementVersion = sample.measurementVersions?.[state.roundB]?.version ?? 1
  const conclusions = useAppSelector(selectConclusions(sample.styleCode, state.roundB))
  const activeConclusion = conclusions.find((item) => item.status === '现行')
  const frozenConclusion = conclusions.find((item) => item.status === '已冻结')
  const saveVersion = pattern.nextSaveVersion[`${sample.styleCode}::${state.roundB}`] ?? 0

  const invalidDecisions = state.decisions.filter(
    (item) => item.sampleId === sample.id && item.valid === false && item.round === state.roundB,
  )

  const comparison = useMemo(() => {
    const a = sample.measurements[state.roundA]
    const b = sample.measurements[state.roundB]
    return a.map((item, index) => ({
      ...item,
      previous: item.actual,
      current: b[index].actual,
      delta: b[index].actual - item.actual,
      inTolerance: Math.abs(b[index].actual - b[index].spec) <= b[index].tolerance,
    }))
  }, [sample, state.roundA, state.roundB])

  const handleImageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (state.locked) return
    const target = event.target as HTMLElement
    if (target.closest('[data-annotation]')) return
    setAnnotationOpen(true)
  }

  const submitDecision = (decision: '已采纳' | '未采纳') => {
    if (!decisionDialog || !decisionReason.trim()) return
    dispatch(
      submitDecisionWorkflow({ proposalId: decisionDialog, decision, reason: decisionReason, round: state.roundB }),
    )
    setDecisionDialog(null)
    setDecisionReason('')
  }

  const openMeasureDialog = (item: Measurement) => {
    setMeasureTarget(item)
    setMeasureValue(String(item.actual))
  }

  const confirmMeasureChange = () => {
    if (!measureTarget) return
    const value = Number(measureValue)
    if (!Number.isFinite(value) || value === measureTarget.actual) {
      setMeasureTarget(null)
      return
    }
    dispatch(
      changeMeasurements({
        sampleId: sample.id,
        round: state.roundB,
        key: measureTarget.key,
        actual: value,
        changedBy: measureBy || '当前用户',
      }),
    )
    setMeasureTarget(null)
  }

  const buildPayload = (author: string, authorRole: string): SubmitPayload => ({
    sampleId: sample.id,
    styleCode: sample.styleCode,
    round: state.roundB,
    author,
    role: authorRole,
    note: conclusionNote,
    adoptedProposalIds: adopted,
    measurements: sample.measurements[state.roundB],
    measurementVersion,
    baseSaveVersion: saveVersion,
  })

  const authorOfRole = (authorRole: string) => (authorRole === '版师' ? '周研' : '沈岚')

  const handleSubmit = () => {
    dispatch(submitConclusion(buildPayload(authorOfRole(role), role)))
    setConclusionNote('')
    setAdopted([])
  }

  const handleSimultaneous = () => {
    // 模拟版师与产品同时提交同一款：先到的成立，后到的进冲突对比。
    const first = buildPayload('周研', '版师')
    const second: SubmitPayload = {
      ...buildPayload('沈岚', '产品开发'),
      note: conclusionNote || '产品意见：维持现有视觉比例，优先调整吃势。',
      adoptedProposalIds: sample.proposals
        .map((item) => item.id)
        .filter((id) => !adopted.includes(id))
        .slice(0, 1),
    }
    dispatch(simultaneousSubmit({ first, second }))
    setConclusionNote('')
    setAdopted([])
  }

  const proposalName = (id: string) => {
    const proposal = sample.proposals.find((item) => item.id === id)
    return proposal ? `${proposal.affectedPart}方案（${proposal.author}）` : id
  }

  const conflict = pattern.pendingConflict && pattern.pendingConflict.sampleId === sample.id ? pattern.pendingConflict : null

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">SAMPLE REVIEW / 样品评审</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · 轮次对比</Typography>
          <Typography color="text.secondary">
            量体数字改动即升版本，旧认可失效并重算超差；冻结版只读，后续调整另存新结论。
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PhotoCameraBackOutlinedIcon />}>上传样衣照片</Button>
          <Button variant="contained" disabled={state.locked} onClick={() => dispatch(saveDraft({ sampleId: sample.id, notes: '评审草稿已保存' }))}>保存当前草稿</Button>
        </Stack>
      </Box>

      {state.locked && <Alert severity="success" sx={{ mb: 1.5 }}>该轮次已审核冻结。冻结版保持原样，量体与方案解锁后才能调整。</Alert>}
      {invalidDecisions.length > 0 && !state.locked && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          量体结果已更新到 v{measurementVersion}：{invalidDecisions.length}
          项按旧数字作出的认可已失效，请对照重算后的超差部位重新确认改版办法。
        </Alert>
      )}
      {conflict && (
        <Alert severity="error" sx={{ mb: 1.5 }} action={
          <Button color="inherit" size="small" onClick={() => setDecisionDialog(`CONFLICT-${conflict.winner.id}`)}>查看差异</Button>
        }>
          {conflict.winner.role} {conflict.winner.author} 的提交先到成立（#{conflict.winner.saveVersion}）；
          {conflict.incoming.role} {conflict.incoming.author} 后到，不能覆盖，需比对两次保存差异后选择放弃或另存。
        </Alert>
      )}
      {sample.annotations.some((item) => item.status === '待处理') && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          当前仍有 {sample.annotations.filter((item) => item.status === '待处理').length} 项待处理批注，审核冻结前必须逐项关闭。
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0,1.15fr) minmax(340px,.85fr)' }, gap: 1.5 }}>
        <Box className="panel">
          <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight={800}>尺寸实测差异</Typography>
              <Chip size="small" color="secondary" label={`${state.roundB} 量体 v${measurementVersion}`} />
              {frozenConclusion && <Chip size="small" variant="outlined" label={`冻结版 #${frozenConclusion.saveVersion}`} />}
            </Stack>
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>基准轮次</InputLabel>
                <Select label="基准轮次" value={state.roundA} onChange={(event) => dispatch(setRounds({ a: event.target.value as typeof state.roundA }))}>
                  {rounds.map((round) => <MenuItem key={round} value={round}>{round}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>对比轮次</InputLabel>
                <Select label="对比轮次" value={state.roundB} onChange={(event) => dispatch(setRounds({ b: event.target.value as typeof state.roundB }))}>
                  {rounds.map((round) => <MenuItem key={round} value={round}>{round}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          </Box>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 660 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f6f5f2' }}>
                  <TableCell>部位</TableCell>
                  <TableCell>规格</TableCell>
                  <TableCell>±容差</TableCell>
                  <TableCell>{state.roundA}</TableCell>
                  <TableCell>{state.roundB} 实测</TableCell>
                  <TableCell>变化</TableCell>
                  <TableCell>判定</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {comparison.map((item) => (
                  <TableRow key={item.key} sx={{ bgcolor: item.inTolerance ? 'transparent' : '#fff4ef' }}>
                    <TableCell sx={{ fontWeight: 750 }}>{item.name}</TableCell>
                    <TableCell>{item.spec} cm</TableCell>
                    <TableCell>±{item.tolerance}</TableCell>
                    <TableCell>{item.previous.toFixed(1)}</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: item.inTolerance ? '#2d7665' : '#b44b2d' }}>{item.current.toFixed(1)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={`${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}`} color={Math.abs(item.delta) > 0.5 ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" icon={item.inTolerance ? <CheckCircleOutlineIcon /> : <CancelOutlinedIcon />} label={item.inTolerance ? '达标' : '超差'} color={item.inTolerance ? 'success' : 'error'} />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="量体数字一改，旧认可失效并按新数字重算超差；冻结版不受影响">
                        <span>
                          <Button
                            size="small"
                            sx={{ minWidth: 0, px: 0.6 }}
                            disabled={state.locked}
                            startIcon={<EditOutlinedIcon fontSize="small" />}
                            onClick={() => openMeasureDialog(item)}
                          >
                            改量体
                          </Button>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Box sx={{ px: 2, py: 1, borderTop: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Typography color="text.secondary" fontSize={12}>
              最近量体更新：{sample.measurementVersions?.[state.roundB]?.changedAt} · {sample.measurementVersions?.[state.roundB]?.changedBy}
            </Typography>
            <Typography color="text.secondary" fontSize={12}>
              超差 {comparison.filter((item) => !item.inTolerance).length} 项 · 当前保存版本 #{saveVersion}
            </Typography>
          </Box>
          <Box sx={{ p: 1.5, borderTop: '1px solid #ece9e4' }}>
            <TextField
              multiline
              minRows={2}
              fullWidth
              size="small"
              label="轮次评审草稿"
              defaultValue={state.draftNotes[sample.id] ?? '第二轮肩袖活动量已改善；建议采纳肩线内收方案，第三轮复核举臂舒适度。'}
              onBlur={(event) => dispatch(saveDraft({ sampleId: sample.id, notes: event.target.value }))}
            />
          </Box>
        </Box>

        <Box className="panel">
          <Box sx={{ px: 1.8, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between' }}>
            <Typography fontWeight={800}>样衣部位批注 · {state.roundB}</Typography>
            <Button size="small" startIcon={<AddLocationAltOutlinedIcon />} disabled={state.locked} onClick={() => setAnnotationOpen(true)}>添加批注</Button>
          </Box>
          <Box
            onClick={handleImageClick}
            sx={{
              position: 'relative',
              height: 420,
              m: 1.5,
              overflow: 'hidden',
              cursor: state.locked ? 'default' : 'crosshair',
              borderRadius: 1.5,
              background: 'linear-gradient(180deg,#dfe5e4 0%,#cbd4d1 100%)',
              backgroundImage: 'linear-gradient(180deg,#dce4e2 0%,#c7d2cf 100%), repeating-linear-gradient(90deg,transparent 0 39px,rgba(255,255,255,.18) 40px)',
            }}
          >
            <Box sx={{ position: 'absolute', left: '50%', top: 32, transform: 'translateX(-50%)', width: 170, height: 55, border: '3px solid #526a65', borderRadius: '50% 50% 22% 22%', bgcolor: '#657d77' }} />
            <Box sx={{ position: 'absolute', left: '50%', top: 80, transform: 'translateX(-50%)', width: 210, height: 230, border: '3px solid #526a65', borderRadius: '38px 38px 22px 22px', bgcolor: '#718983' }}>
              <Box sx={{ position: 'absolute', left: 50, top: 72, width: 110, height: 76, border: '1px dashed rgba(255,255,255,.6)', borderRadius: 2 }} />
              <Box sx={{ position: 'absolute', left: 35, top: 30, right: 35, borderTop: '2px solid rgba(255,255,255,.45)' }} />
              <Box sx={{ position: 'absolute', left: 38, top: 148, width: 34, height: 48, border: '2px solid #455c57', borderRadius: 1 }} />
              <Box sx={{ position: 'absolute', right: 38, top: 148, width: 34, height: 48, border: '2px solid #455c57', borderRadius: 1 }} />
            </Box>
            <Box sx={{ position: 'absolute', left: 50, top: 96, width: 52, height: 200, border: '3px solid #526a65', borderRadius: '25px 8px 12px 25px', bgcolor: '#657d77', transform: 'rotate(7deg)' }} />
            <Box sx={{ position: 'absolute', right: 50, top: 96, width: 52, height: 200, border: '3px solid #526a65', borderRadius: '8px 25px 25px 12px', bgcolor: '#657d77', transform: 'rotate(-7deg)' }} />
            {sample.annotations.map((annotation) => (
              <Tooltip key={annotation.id} title={`${annotation.part}：${annotation.content}`}>
                <Box
                  data-annotation
                  onClick={(event) => {
                    event.stopPropagation()
                    dispatch(toggleAnnotation(state.activeAnnotation === annotation.id ? null : annotation.id))
                  }}
                  sx={{
                    position: 'absolute',
                    left: `${annotation.x}%`,
                    top: `${annotation.y}%`,
                    width: 24,
                    height: 24,
                    display: 'grid',
                    placeItems: 'center',
                    transform: 'translate(-50%,-50%)',
                    borderRadius: '50%',
                    color: '#fff',
                    bgcolor: annotation.status === '待处理' ? '#cf6236' : '#397c69',
                    border: '3px solid rgba(255,255,255,.9)',
                    boxShadow: '0 3px 10px rgba(0,0,0,.25)',
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {annotation.id.slice(-2)}
                </Box>
              </Tooltip>
            ))}
            <Chip label="点击样衣任意部位添加批注" size="small" sx={{ position: 'absolute', left: 12, bottom: 12, bgcolor: 'rgba(255,255,255,.9)' }} />
          </Box>
          <Stack spacing={1} sx={{ px: 1.5, pb: 1.5 }}>
            {sample.annotations.map((annotation) => (
              <Box key={annotation.id} sx={{ p: 1.2, borderLeft: `3px solid ${annotation.status === '待处理' ? '#cf6236' : '#397c69'}`, bgcolor: '#f8f7f4', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontWeight={800} fontSize={12}>{annotation.part} · {annotation.author}</Typography>
                  <Button size="small" onClick={() => dispatch(toggleAnnotation(annotation.id))}>查看</Button>
                </Stack>
                <Typography color="text.secondary" fontSize={11} mt={0.4}>{annotation.content}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      <Box className="panel" sx={{ mt: 1.5 }}>
        <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountTreeOutlinedIcon color="primary" />
          <Typography fontWeight={800}>版型结论链 · {state.roundB}</Typography>
          <Chip size="small" label={`量体 v${measurementVersion}`} />
          <Chip size="small" variant="outlined" label={`保存版本 #${saveVersion}`} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.05fr) minmax(300px,.95fr)' }, gap: 0 }}>
          <Box sx={{ p: 2, borderRight: { xs: 'none', lg: '1px solid #ece9e4' } }}>
            {conclusions.length === 0 && (
              <Alert severity="info">还没有版型结论。按当前量体 v{measurementVersion} 数字确认改版办法后提交，即形成首条结论。</Alert>
            )}
            <Stack spacing={1.2}>
              {conclusions.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    p: 1.4,
                    border: '1px solid #e2dfda',
                    borderLeft: `4px solid ${item.status === '已冻结' ? '#4a6fa5' : item.status === '现行' ? '#2d7665' : item.status === '已失效' ? '#b44b2d' : '#b8b2a9'}`,
                    borderRadius: 1.2,
                    opacity: item.status === '现行' || item.status === '已冻结' ? 1 : 0.72,
                    bgcolor: item.status === '现行' ? '#f1f7f4' : '#fff',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={0.5}>
                    <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
                      <Typography fontWeight={800} fontSize={13}>#{item.saveVersion} · {item.id}</Typography>
                      <Chip size="small" color={statusColor[item.status]} label={item.status} />
                      <Chip size="small" variant="outlined" label={item.basis} />
                    </Stack>
                    <Typography color="text.secondary" fontSize={11}>量体 v{item.measurementVersion} · {item.createdAt}</Typography>
                  </Stack>
                  <Typography fontSize={12.5} mt={0.8}>{item.note || '（无评审说明）'}</Typography>
                  <Stack direction="row" spacing={0.6} mt={0.8} flexWrap="wrap" useFlexGap>
                    <Typography fontSize={11} color="text.secondary">认可办法：</Typography>
                    {item.adoptedProposalIds.length ? item.adoptedProposalIds.map((id) => (
                      <Chip key={id} size="small" label={proposalName(id)} />
                    )) : <Typography fontSize={11} color="text.secondary">无</Typography>}
                  </Stack>
                  <Typography fontSize={11} mt={0.6} color={item.outOfTolerance.length ? '#b44b2d' : 'text.secondary'}>
                    重算超差（{item.outOfTolerance.length}）：
                    {item.outOfTolerance.length
                      ? item.outOfTolerance.map((part) => `${part.name}${part.deviation > 0 ? '+' : ''}${part.deviation.toFixed(1)}`).join('、')
                      : '全部达标'}
                  </Typography>
                  {item.frozenSnapshot && (
                    <Typography fontSize={11} mt={0.6} color="#4a6fa5">
                      冻结快照：{item.frozenSnapshot.frozenAt} · {item.frozenSnapshot.frozenBy} · {item.frozenSnapshot.note}
                    </Typography>
                  )}
                  {item.invalidReason && <Typography fontSize={11} mt={0.6} color="#b44b2d">失效原因：{item.invalidReason}</Typography>}
                  {item.status === '已被后版替代' && item.supersededById && (
                    <Typography fontSize={11} mt={0.4} color="text.secondary">已由 {item.supersededById} 顶替，原记录保留。</Typography>
                  )}
                </Box>
              ))}
            </Stack>
          </Box>

          <Box sx={{ p: 2 }}>
            <Typography fontWeight={800} fontSize={13} mb={1.2}>提交本轮版型结论</Typography>
            <Typography color="text.secondary" fontSize={12} mb={1.2}>
              依据量体 v{measurementVersion}、保存版本 #{saveVersion}。冻结后提交会自动另存「冻结后调整」结论。
            </Typography>
            <Stack spacing={1.3}>
              <FormControl size="small" fullWidth>
                <InputLabel>提交角色</InputLabel>
                <Select label="提交角色" value={role} onChange={(event) => setRole(event.target.value)} disabled={state.locked}>
                  {roles.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                label="结论说明"
                size="small"
                multiline
                minRows={2}
                value={conclusionNote}
                disabled={state.locked}
                placeholder="按新量体数字，确认超差部位与改版处理……"
                onChange={(event) => setConclusionNote(event.target.value)}
              />
              <Box>
                <Typography fontSize={12} color="text.secondary" mb={0.5}>认可改版办法（可多选）</Typography>
                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                  {sample.proposals.map((proposal) => (
                    <Chip
                      key={proposal.id}
                      size="small"
                      disabled={state.locked}
                      color={adopted.includes(proposal.id) ? 'primary' : 'default'}
                      label={`${proposal.affectedPart} · ${proposal.author}`}
                      onClick={() => setAdopted((current) => current.includes(proposal.id) ? current.filter((id) => id !== proposal.id) : [...current, proposal.id])}
                    />
                  ))}
                </Stack>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button variant="contained" fullWidth disabled={state.locked} onClick={handleSubmit}>
                  {role}提交确认
                </Button>
                <Tooltip title="模拟版师与产品几乎同时保存：先到成立，后到进入差异对比，不会覆盖">
                  <Button variant="outlined" disabled={state.locked} onClick={handleSimultaneous}>
                    模拟双方同时提交
                  </Button>
                </Tooltip>
              </Stack>
              {activeConclusion && (
                <Typography fontSize={11} color="text.secondary">
                  现行结论 #{activeConclusion.saveVersion}（{activeConclusion.author}）仍成立；若他人已先保存，你的提交将被拦下比对。
                </Typography>
              )}
            </Stack>
          </Box>
        </Box>
      </Box>

      <Box className="panel" sx={{ mt: 1.5 }}>
        <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4' }}>
          <Typography fontWeight={800}>替代修改方案与采纳决定</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' }, gap: 1.5, p: 1.5 }}>
          {sample.proposals.map((proposal) => {
            const decision = [...state.decisions].reverse().find((item) => item.proposalId === proposal.id && item.sampleId === sample.id)
            const invalid = decision?.valid === false
            return (
              <Box key={proposal.id} sx={{ p: 1.5, border: '1px solid #e2dfda', borderRadius: 1.2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontWeight={800}>{proposal.affectedPart} · {proposal.role}</Typography>
                  <Stack direction="row" spacing={0.5}>
                    {invalid && <Chip size="small" color="error" label="旧认可失效" />}
                    <Chip size="small" label={proposal.status} color={proposal.status === '已采纳' ? 'success' : proposal.status === '未采纳' ? 'default' : 'warning'} />
                  </Stack>
                </Stack>
                <Typography fontSize={13} mt={1}>{proposal.content}</Typography>
                <Typography color="text.secondary" fontSize={11} mt={0.7}>
                  提交人：{proposal.author}
                  {decision?.measurementVersion ? ` · 认可依据量体 v${decision.measurementVersion}` : ''}
                </Typography>
                {invalid && <Typography fontSize={11} color="#b44b2d" mt={0.5}>{decision?.invalidReason}</Typography>}
                {proposal.status === '待决定' && (
                  <Button size="small" variant="outlined" sx={{ mt: 1.2 }} onClick={() => setDecisionDialog(proposal.id)} disabled={state.locked}>
                    作出决定
                  </Button>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>

      <Dialog open={annotationOpen} onClose={() => setAnnotationOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>添加部位批注</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} pt={1}>
            <TextField label="详细部位" value={annotationDraft.part} onChange={(event) => setAnnotationDraft({ ...annotationDraft, part: event.target.value })} />
            <TextField multiline minRows={3} label="批注内容" value={annotationDraft.content} onChange={(event) => setAnnotationDraft({ ...annotationDraft, content: event.target.value })} />
            <Typography color="text.secondary" fontSize={12}>批注锚点：{annotationDraft.x}% / {annotationDraft.y}% · 轮次 {state.roundB}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnnotationOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={!annotationDraft.part.trim() || !annotationDraft.content.trim()}
            onClick={() => {
              sample.annotations.push({ id: `AN-${Date.now()}`, author: '当前用户', status: '待处理', ...annotationDraft })
              setAnnotationDraft({ x: 50, y: 42, part: '版型', content: '' })
              setAnnotationOpen(false)
            }}
          >
            添加并标记待处理
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(measureTarget)} onClose={() => setMeasureTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>修改量体数字 · {measureTarget?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} pt={1}>
            <Typography color="text.secondary" fontSize={12.5}>
              保存后量体版本 v{measurementVersion} → v{measurementVersion + 1}：按旧数字认可的改版办法失效，超差部位按新数字重算；已冻结那版保持原样。
            </Typography>
            <TextField type="number" label="新实测值（cm）" value={measureValue} onChange={(event) => setMeasureValue(event.target.value)} />
            <TextField label="修改人" value={measureBy} onChange={(event) => setMeasureBy(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMeasureTarget(null)}>取消</Button>
          <Button variant="contained" onClick={confirmMeasureChange}>保存并升版本</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(decisionDialog) && !decisionDialog?.startsWith('CONFLICT-')} onClose={() => setDecisionDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>填写采纳决定说明</DialogTitle>
        <DialogContent>
          <TextField autoFocus multiline minRows={3} fullWidth label="决定理由（必填）" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} sx={{ mt: 1 }} />
          <Typography color="text.secondary" fontSize={12} mt={1}>该决定绑定量体 v{measurementVersion}，量体数字再改将自动失效。</Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" disabled={!decisionReason.trim()} startIcon={<CancelOutlinedIcon />} onClick={() => submitDecision('未采纳')}>不采纳</Button>
          <Button variant="contained" disabled={!decisionReason.trim()} startIcon={<CheckCircleOutlineIcon />} onClick={() => submitDecision('已采纳')}>采纳方案</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(conflict)} onClose={() => dispatch(clearConflict())} fullWidth maxWidth="md">
        <DialogTitle>两次保存差异 · 先到成立，不可覆盖</DialogTitle>
        <DialogContent>
          {conflict && (
            <Stack spacing={1.5} pt={1}>
              <Alert severity="error">
                先到：{conflict.winner.role} {conflict.winner.author}（#{conflict.winner.saveVersion}，依据量体 v{conflict.winner.measurementVersion}）已成立；
                后到：{conflict.incoming.role} {conflict.incoming.author} 依据保存版本 #{conflict.incoming.baseSaveVersion}，与当前 #{conflict.expectedSaveVersion} 不一致。
              </Alert>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f6f5f2' }}>
                    <TableCell>差异项</TableCell>
                    <TableCell>先到（已成立）</TableCell>
                    <TableCell>后到（你的提交）</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {conflict.diff.map((row) => (
                    <TableRow key={row.field} sx={{ bgcolor: row.changed ? '#fff4ef' : 'transparent' }}>
                      <TableCell sx={{ fontWeight: 700 }}>{row.field}</TableCell>
                      <TableCell>{row.ours}</TableCell>
                      <TableCell sx={{ color: row.changed ? '#b44b2d' : 'text.primary', fontWeight: row.changed ? 700 : 400 }}>{row.theirs}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Divider />
              <Typography fontSize={12.5} color="text.secondary">
                「另存新结论」会把后到提交存为并存的「并行确认」结论，先到结论原样保留；「放弃」则只保留先到结论。
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => dispatch(clearConflict())}>关闭</Button>
          <Button variant="outlined" color="error" onClick={() => dispatch(resolveConflict({ mode: '放弃后到' }))}>放弃后到</Button>
          <Button variant="contained" onClick={() => dispatch(resolveConflict({ mode: '另存新结论' }))}>后到另存新结论</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
