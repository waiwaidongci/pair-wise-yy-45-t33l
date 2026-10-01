import { Alert, Button, Stack, Typography } from '@mui/material'
import RestoreIcon from '@mui/icons-material/Restore'
import type { VersionIssue } from '../features/developmentSlice'

type Props = {
  issue: VersionIssue | null
  busy?: boolean
  onRetry: () => void
  onDismiss: () => void
}

export default function VersionIssueBanner({ issue, busy, onRetry, onDismiss }: Props) {
  if (!issue) return null
  return (
    <Alert
      severity="error"
      sx={{ mb: 1.5 }}
      action={
        <Stack direction="row" spacing={1}>
          <Button color="inherit" size="small" startIcon={<RestoreIcon />} onClick={onRetry} disabled={busy}>
            重试提交
          </Button>
          <Button color="inherit" size="small" onClick={onDismiss} disabled={busy}>
            关闭
          </Button>
        </Stack>
      }
    >
      <Typography fontWeight={800}>保存缺少版本号，原记录未改动</Typography>
      <Typography fontSize={13}>{issue.message} 你的修改已保留在草稿中，可重试提交。</Typography>
    </Alert>
  )
}
