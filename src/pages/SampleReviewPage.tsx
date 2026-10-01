import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined'
import PhotoCameraBackOutlinedIcon from '@mui/icons-material/PhotoCameraBackOutlined'
import LockClockOutlinedIcon from '@mui/icons-material/LockClockOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  adoptServerVersion,
  clearConflict,
  clearVersionIssue,
  decideProposal,
  rebaseOntoServer,
  saveDraft,
  setRounds,
  switchRole,
  toggleAnnotation,
  updateMeasurement,
} from '../features/developmentSlice'
import { fingerprint, recomputeOutOfTolerance, ROUNDS } from '../features/conclusion'
import type { Role, Sample } from '../api/types'
import { useCommitConclusion } from '../features/useCommitConclusion'
import ConflictDialog from '../components/ConflictDialog'
import VersionIssueBanner from '../components/VersionIssueBanner'

const rounds = ROUNDS

export default function SampleReviewPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [decisionDialog, setDecisionDialog] = useState<string | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [annotationDraft, setAnnotationDraft] = useState({ x: 50, y: 42, part: '版型', content: '' })
  const imageRef = useRef<HTMLDivElement>(null)

  const { commitConclusion, isCommitting } = useCommitConclusion()
  const conflict = state.conflict
  const versionIssue = state.versionIssue

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

  const currentFingerprint = useMemo(
    () => fingerprint(sample.measurements[state.roundB]),
    [sample.measurements, state.roundB],
  )
  const outOfToleranceKeys = useMemo(
    () => recomputeOutOfTolerance(sample.measurements[state.roundB]),
    [sample.measurements, state.roundB],
  )
  const outOfToleranceNames = outOfToleranceKeys.map(
    (key) => sample.measurements[state.roundB].find((item) => item.key === key)?.name ?? key,
  )
  const isStale =
    state.committedFingerprints[sample.id] != null &&
    currentFingerprint !== state.committedFingerprints[sample.id]
  const frozenCount = sample.conclusions.filter((item) => item.status === '已冻结').length

  const handleImageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (state.locked) return
    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnnotationDraft((current) => ({
      ...current,
      x: Math.round(((event.clientX - rect.left) / rect.width) * 100),
      y: Math.round(((event.clientY - rect.top) / rect.height) * 100),
    }))
    setAnnotationOpen(true)
  }

  const submitDecision = (decision: '已采纳' | '未采纳') => {
    if (!decisionDialog || !decisionReason.trim()) return
    dispatch(decideProposal({ proposalId: decisionDialog, decision, reason: decisionReason, decidedAt: new Date().toLocaleString('zh-CN') }))
    setDecisionDialog(null)
    setDecisionReason('')
  }

  const handleCommit = async () => {
    await commitConclusion({
      sample,
      round: state.roundB,
      baselineRound: state.roundA,
      decisions: state.decisions,
      note: state.draftNotes[sample.id] ?? '',
      status: '已确认',
    })
  }

  const handleRetryVersionIssue = async () => {
    if (!versionIssue) return
    await commitConclusion({
      sample,
      round: versionIssue.yourDraft.round,
      baselineRound: versionIssue.yourDraft.baselineRound,
      decisions: state.decisions,
      note: versionIssue.yourDraft.note,
      status: versionIssue.yourDraft.status,
    })
  }

  const handleAdoptServerVersion = () => {
    dispatch(adoptServerVersion())
  }

  const handleSaveAsNewVersion = async () => {
    if (!conflict) return
    const { serverSample, yourDraft } = conflict
    const rebased: Sample = {
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
  }

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">SAMPLE REVIEW / 样品评审</Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography component="h1" fontWeight={800}>{sample.styleCode} · 轮次对比</Typography>
            <Chip size="small" label={`当前版本 v${sample.version}`} color="primary" variant="outlined" />
            {frozenCount > 0 && <Chip size="small" icon={<LockClockOutlinedIcon />} label={`已有 ${frozenCount} 个冻结版本`} color="success" />}
          </Stack>
          <Typography color="text.secondary">尺寸差异超过容差自动高亮；量体改动后旧认可失效，按新数字重算超差部位。</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <ToggleButtonGroup
            size="small"
            value={state.activeRole}
            exclusive
            onChange={(_event, value: Role | null) => {
              if (value) dispatch(switchRole(value))
            }}
          >
            {(['版师', '产品'] as Role[]).map((role) => (
              <ToggleButton key={role} value={role}>
                {role}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Button variant="outlined" startIcon={<PhotoCameraBackOutlinedIcon />}>上传样衣照片</Button>
          <Button variant="outlined" disabled={state.locked} onClick={() => dispatch(saveDraft({ sampleId: sample.id, notes: '评审草稿已保存' }))}>保存当前草稿</Button>
          <Button variant="contained" disabled={state.locked || isCommitting} onClick={handleCommit}>
            提交版型确认
          </Button>
        </Stack>
      </Box>

      <VersionIssueBanner issue={versionIssue} busy={isCommitting} onRetry={handleRetryVersionIssue} onDismiss={() => dispatch(clearVersionIssue())} />
      {state.locked && <Alert severity="success" sx={{ mb: 1.5 }}>该轮次已审核锁定。解锁后新增调整将另存为新版本，不覆盖冻结版。</Alert>}
      {isStale && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          量体数字已变更，先前按旧数字认可的改版办法已失效。请按新数字确认超差部位与方案后重新提交版型结论。
        </Alert>
      )}
      {frozenCount > 0 && !state.locked && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          已存在冻结版本（v{sample.conclusions[sample.conclusions.length - 1]?.version}）。本次调整将另存为新结论，冻结版保持原样、不可覆盖。
        </Alert>
      )}
      {sample.annotations.some((item) => item.status === '待处理') && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          当前仍有 {sample.annotations.filter((item) => item.status === '待处理').length} 项待处理批注，审核锁定前必须逐项关闭。
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0,1.15fr) minmax(340px,.85fr)' }, gap: 1.5 }}>
        <Box className="panel">
          <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Typography fontWeight={800}>尺寸实测差异</Typography>
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
            <Table size="small" sx={{ minWidth: 620 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f6f5f2' }}>
                  <TableCell>部位</TableCell>
                  <TableCell>规格</TableCell>
                  <TableCell>±容差</TableCell>
                  <TableCell>{state.roundA}</TableCell>
                  <TableCell>{state.roundB}（实测可改）</TableCell>
                  <TableCell>变化</TableCell>
                  <TableCell>判定</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {comparison.map((item) => (
                  <TableRow key={item.key} sx={{ bgcolor: item.inTolerance ? 'transparent' : '#fff4ef' }}>
                    <TableCell sx={{ fontWeight: 750 }}>{item.name}</TableCell>
                    <TableCell>{item.spec} cm</TableCell>
                    <TableCell>±{item.tolerance}</TableCell>
                    <TableCell>{item.previous.toFixed(1)}</TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        variant="standard"
                        value={item.current}
                        disabled={state.locked}
                        onChange={(event) => {
                          const value = parseFloat(event.target.value)
                          if (Number.isFinite(value)) {
                            dispatch(updateMeasurement({ sampleId: sample.id, round: state.roundB, key: item.key, actual: value }))
                          }
                        }}
                        sx={{ width: 78, '& input': { fontWeight: 800, color: item.inTolerance ? '#2d7665' : '#b44b2d' } }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={`${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}`} color={Math.abs(item.delta) > 0.5 ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" icon={item.inTolerance ? <CheckCircleOutlineIcon /> : <CancelOutlinedIcon />} label={item.inTolerance ? '达标' : '超差'} color={item.inTolerance ? 'success' : 'error'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Box sx={{ px: 2, py: 1, borderTop: '1px solid #ece9e4', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography fontSize={12} color="text.secondary">按当前量体重算超差部位：</Typography>
            {outOfToleranceNames.length === 0 ? (
              <Chip size="small" label="全部达标" color="success" />
            ) : (
              outOfToleranceNames.map((name) => <Chip key={name} size="small" label={name} color="error" />)
            )}
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
            ref={imageRef}
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
        <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4' }}>
          <Typography fontWeight={800}>替代修改方案与采纳决定</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' }, gap: 1.5, p: 1.5 }}>
          {sample.proposals.map((proposal) => (
            <Box key={proposal.id} sx={{ p: 1.5, border: '1px solid #e2dfda', borderRadius: 1.2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={800}>{proposal.affectedPart} · {proposal.role}</Typography>
                <Chip size="small" label={proposal.status} color={proposal.status === '已采纳' ? 'success' : proposal.status === '未采纳' ? 'default' : 'warning'} />
              </Stack>
              <Typography fontSize={13} mt={1}>{proposal.content}</Typography>
              <Typography color="text.secondary" fontSize={11} mt={0.7}>提交人：{proposal.author}</Typography>
              {proposal.status === '待决定' && (
                <Button size="small" variant="outlined" sx={{ mt: 1.2 }} onClick={() => setDecisionDialog(proposal.id)} disabled={state.locked}>
                  作出决定
                </Button>
              )}
            </Box>
          ))}
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

      <Dialog open={Boolean(decisionDialog)} onClose={() => setDecisionDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>填写采纳决定说明</DialogTitle>
        <DialogContent>
          <TextField autoFocus multiline minRows={3} fullWidth label="决定理由（必填）" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" disabled={!decisionReason.trim()} startIcon={<CancelOutlinedIcon />} onClick={() => submitDecision('未采纳')}>不采纳</Button>
          <Button variant="contained" disabled={!decisionReason.trim()} startIcon={<CheckCircleOutlineIcon />} onClick={() => submitDecision('已采纳')}>采纳方案</Button>
        </DialogActions>
      </Dialog>

      <ConflictDialog
        open={Boolean(conflict)}
        conflict={conflict}
        busy={isCommitting}
        onClose={() => dispatch(clearConflict())}
        onAdopt={handleAdoptServerVersion}
        onSaveAsNewVersion={handleSaveAsNewVersion}
      />
    </Box>
  )
}
