import { useState } from 'react'
import { Alert, Box, Button, Collapse, Stack, Typography } from '@mui/material'
import RestoreIcon from '@mui/icons-material/Restore'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { retryMigration } from '../features/developmentSlice'
import { UNRECOVERABLE_KEY } from '../features/migration'

export default function MigrationBanner() {
  const dispatch = useAppDispatch()
  const migration = useAppSelector((state) => state.development.migration)
  const [showRaw, setShowRaw] = useState(false)

  if (migration.status !== 'failed') return null

  return (
    <Alert
      severity="error"
      sx={{ mb: 1.5 }}
      action={
        <Stack direction="row" spacing={1}>
          <Button color="inherit" size="small" startIcon={<RestoreIcon />} onClick={() => dispatch(retryMigration())}>
            重试读取
          </Button>
          <Button color="inherit" size="small" onClick={() => setShowRaw((value) => !value)}>
            {showRaw ? '收起原记录' : '查看原记录'}
          </Button>
        </Stack>
      }
    >
      <Typography fontWeight={800}>存档版本无法识别，已原样保留原记录</Typography>
      <Typography fontSize={13}>{migration.message ?? '读取不到版本号，为避免覆盖已切换到示例数据；原记录已保留，可重试读取。'}</Typography>
      <Collapse in={showRaw}>
        <Box
          component="pre"
          sx={{
            mt: 1,
            p: 1,
            maxHeight: 180,
            overflow: 'auto',
            fontSize: 11,
            bgcolor: 'rgba(0,0,0,.06)',
            borderRadius: 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {`${UNRECOVERABLE_KEY}\n${migration.raw ?? ''}`}
        </Box>
      </Collapse>
    </Alert>
  )
}
