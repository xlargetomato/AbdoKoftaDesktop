import { useSyncStore, type SyncStatus } from './sync-store'

const LABELS: Record<SyncStatus, string> = {
  online: 'متصل',
  offline: 'غير متصل',
  syncing: 'جاري المزامنة',
  synced: 'تمت المزامنة'
}

const CLASS: Record<SyncStatus, string> = {
  online: 'sync--online',
  offline: 'sync--offline',
  syncing: 'sync--syncing',
  synced: 'sync--synced'
}

export function SyncStatusBadge(): React.ReactElement {
  const status = useSyncStore((s) => s.status)
  const progress = useSyncStore((s) => s.syncProgress)
  const message = useSyncStore((s) => s.syncMessage)
  const progressLabel = progress == null ? null : `${Math.round(progress)}%`
  const label = progressLabel ? `${message ?? LABELS[status]} ${progressLabel}` : LABELS[status]

  return (
    <span className={`sync-badge ${CLASS[status]}`} title={label}>
      <span className="sync-badge__dot" />
      {label}
    </span>
  )
}
