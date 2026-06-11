import { useSyncStore, type SyncStatus } from './sync-store'

const LABELS: Record<SyncStatus, string> = {
  idle: 'محفوظ محليًا',
  uploading: 'جاري الرفع',
  upload_error: 'خطأ في الرفع'
}

const CLASS: Record<SyncStatus, string> = {
  idle: 'sync--online',
  uploading: 'sync--syncing',
  upload_error: 'sync--offline'
}

export function SyncStatusBadge(): React.ReactElement {
  const status = useSyncStore((s) => s.status)
  const pendingUpload = useSyncStore((s) => s.pendingUpload)
  const progress = useSyncStore((s) => s.syncProgress)
  const message = useSyncStore((s) => s.syncMessage)

  const progressLabel = progress == null ? null : `${Math.round(progress)}%`
  const pendingLabel = pendingUpload > 0 && status === 'idle' ? ` (${pendingUpload} في الانتظار)` : ''
  const label = progressLabel
    ? `${message ?? LABELS[status]} ${progressLabel}`
    : `${LABELS[status]}${pendingLabel}`

  return (
    <span className={`sync-badge ${CLASS[status]}`} title={label}>
      <span className="sync-badge__dot" />
      {label}
    </span>
  )
}
