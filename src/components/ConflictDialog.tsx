import { useMemo } from 'react'
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
  Typography,
} from '@mui/material'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import type { ConflictInfo } from '../features/developmentSlice'
import { recomputeOutOfTolerance } from '../features/conclusion'

type Props = {
  open: boolean
  conflict: ConflictInfo | null
  busy?: boolean
  onClose: () => void
  onAdopt: () => void
  onSaveAsNewVersion: () => void
}

export default function ConflictDialog({ open, conflict, busy, onClose, onAdopt, onSaveAsNewVersion }: Props) {
  const diff = useMemo(() => {
    if (!conflict) return null
    const { serverSample, yourDraft, serverVersion, yourBaseVersion } = conflict
    const theirs = serverSample.conclusions[serverSample.conclusions.length - 1]

    const measurementChanges = (theirs?.measurements ?? []).flatMap((theirItem) => {
      const yours = yourDraft.measurements.find((item) => item.key === theirItem.key)
      if (!yours || yours.actual === theirItem.actual) return []
      return [
        {
          key: theirItem.key,
          name: theirItem.name,
          from: theirItem.actual,
          to: yours.actual,
          inTolerance: Math.abs(yours.actual - yours.spec) <= yours.tolerance,
        },
      ]
    })

    const theirOutOfTolerance = new Set(theirs?.outOfTolerance ?? [])
    const yourOutOfTolerance = recomputeOutOfTolerance(yourDraft.measurements)
    const allKeys = new Set([...theirOutOfTolerance, ...yourOutOfTolerance])
    const toleranceChanges = [...allKeys].map((key) => {
      const name = yourDraft.measurements.find((item) => item.key === key)?.name ?? key
      return { key, name, theirs: theirOutOfTolerance.has(key), yours: yourOutOfTolerance.includes(key) }
    })

    const decisionChanges = serverSample.proposals.flatMap((proposal) => {
      const theirDecision = theirs?.decisions.find((item) => item.proposalId === proposal.id)?.decision
      const yourDecision = yourDraft.decisions.find((item) => item.proposalId === proposal.id)?.decision
      if (theirDecision === yourDecision) return []
      return { proposalId: proposal.id, part: proposal.affectedPart, theirs: theirDecision ?? '未提交', yours: yourDecision ?? '未提交' }
    })

    const noteChanged = (theirs?.note ?? '') !== (yourDraft.note ?? '')

    return {
      theirs,
      serverVersion,
      yourBaseVersion,
      measurementChanges,
      toleranceChanges,
      decisionChanges,
      noteChanged,
    }
  }, [conflict])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmberOutlinedIcon color="warning" />
        保存冲突：对方已先提交，不能覆盖
      </DialogTitle>
      <DialogContent>
        {diff && (
          <Stack spacing={1.6}>
            <Alert severity="warning">
              你基于 v{diff.yourBaseVersion} 提交，对方已先提交到 <b>v{diff.serverVersion}</b>（{diff.theirs?.role}）。
              先到的成立，以下是两次保存的差异；你可以采用对方版本，或保留我方数据另存为新版本（绝不覆盖对方）。
            </Alert>

            <Box>
              <Typography fontWeight={800} fontSize={13} mb={0.6}>量体数字差异（{diff.theirs?.round}）</Typography>
              {diff.measurementChanges.length === 0 ? (
                <Typography color="text.secondary" fontSize={12}>量体数字一致。</Typography>
              ) : (
                <Stack spacing={0.5}>
                  {diff.measurementChanges.map((change) => (
                    <Stack key={change.key} direction="row" spacing={1} alignItems="center" fontSize={13}>
                      <Typography fontWeight={700}>{change.name}</Typography>
                      <Chip size="small" label={`对方 ${change.from.toFixed(1)}`} variant="outlined" />
                      <Typography>→</Typography>
                      <Chip size="small" label={`我方 ${change.to.toFixed(1)}`} color={change.inTolerance ? 'success' : 'error'} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>

            <Divider />

            <Box>
              <Typography fontWeight={800} fontSize={13} mb={0.6}>超差部位（按各自量体重算）</Typography>
              {diff.toleranceChanges.length === 0 ? (
                <Typography color="text.secondary" fontSize={12}>两次判定的超差部位一致。</Typography>
              ) : (
                <Stack spacing={0.5}>
                  {diff.toleranceChanges.map((change) => (
                    <Stack key={change.key} direction="row" spacing={1} alignItems="center" fontSize={12}>
                      <Typography fontWeight={700}>{change.name}</Typography>
                      <Chip size="small" label={change.theirs ? '对方超差' : '对方达标'} color={change.theirs ? 'error' : 'success'} variant="outlined" />
                      <Chip size="small" label={change.yours ? '我方超差' : '我方达标'} color={change.yours ? 'error' : 'success'} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>

            <Divider />

            <Box>
              <Typography fontWeight={800} fontSize={13} mb={0.6}>认可方案差异</Typography>
              {diff.decisionChanges.length === 0 ? (
                <Typography color="text.secondary" fontSize={12}>两次认可的方案一致。</Typography>
              ) : (
                <Stack spacing={0.5}>
                  {diff.decisionChanges.map((change) => (
                    <Stack key={change.proposalId} direction="row" spacing={1} alignItems="center" fontSize={12}>
                      <Typography fontWeight={700}>{change.part}</Typography>
                      <Chip size="small" label={`对方 ${change.theirs}`} variant="outlined" />
                      <Chip size="small" label={`我方 ${change.yours}`} color={change.yours === '已采纳' ? 'success' : 'default'} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>

            {diff.noteChanged && (
              <>
                <Divider />
                <Box>
                  <Typography fontWeight={800} fontSize={13} mb={0.4}>评审备注差异</Typography>
                  <Typography color="text.secondary" fontSize={12}>对方：{diff.theirs?.note || '（空）'}</Typography>
                  <Typography fontSize={12} mt={0.3}>我方：{conflict?.yourDraft.note || '（空）'}</Typography>
                </Box>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>取消</Button>
        <Button onClick={onAdopt} disabled={busy}>采用对方版本（先到成立）</Button>
        <Button variant="contained" onClick={onSaveAsNewVersion} disabled={busy}>保留我方，另存新版本</Button>
      </DialogActions>
    </Dialog>
  )
}
