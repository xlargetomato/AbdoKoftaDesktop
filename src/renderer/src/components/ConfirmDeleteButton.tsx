import { useState } from 'react'

interface ConfirmDeleteButtonProps {
  label?: string
  confirmMessage: string
  onConfirm: () => Promise<void>
  disabled?: boolean
}

export function ConfirmDeleteButton({
  label = 'حذف',
  confirmMessage,
  onConfirm,
  disabled
}: ConfirmDeleteButtonProps): React.ReactElement {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm(): Promise<void> {
    setConfirming(false)
    setError(null)
    setLoading(true)
    try {
      await onConfirm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحذف')
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <span className="confirm-delete-inline">
        <span className="confirm-delete-inline__error">{error}</span>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => setError(null)}
        >
          ✕
        </button>
      </span>
    )
  }

  if (confirming) {
    return (
      <span className="confirm-delete-inline">
        <span className="confirm-delete-inline__msg">{confirmMessage}</span>
        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={() => void handleConfirm()}
          autoFocus
        >
          تأكيد
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => setConfirming(false)}
        >
          إلغاء
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      className="btn btn--danger btn--sm"
      disabled={disabled || loading}
      onClick={() => setConfirming(true)}
    >
      {loading ? '...' : label}
    </button>
  )
}
