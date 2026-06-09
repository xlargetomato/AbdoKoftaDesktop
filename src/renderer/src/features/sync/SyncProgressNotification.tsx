import { useSyncStore } from './sync-store'

export function SyncProgressNotification(): React.ReactElement | null {
  const progress = useSyncStore((s) => s.syncProgress)
  const message = useSyncStore((s) => s.syncMessage)

  if (progress == null) return null

  const percent = Math.max(0, Math.min(100, Math.round(progress)))

  return (
    <div className="sync-progress-toast" role="status" aria-live="polite">
      <div className="sync-progress-toast__header">
        <span>{message ?? 'جاري المزامنة'}</span>
        <strong>{percent}%</strong>
      </div>
      <div className="sync-progress-toast__track">
        <div className="sync-progress-toast__bar" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
