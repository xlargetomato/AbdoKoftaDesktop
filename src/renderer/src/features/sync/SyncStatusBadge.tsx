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
  const display: SyncStatus =
    status === 'synced' && navigator.onLine ? 'online' : status

  return (
    <span className={`sync-badge ${CLASS[display]}`} title={LABELS[display]}>
      <span className="sync-badge__dot" />
      {LABELS[display]}
    </span>
  )
}
