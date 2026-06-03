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
  const [loading, setLoading] = useState(false)

  async function handleClick(): Promise<void> {
    if (!window.confirm(confirmMessage)) return
    setLoading(true)
    try {
      await onConfirm()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل الحذف')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn--danger btn--sm"
      disabled={disabled || loading}
      onClick={() => void handleClick()}
    >
      {loading ? '...' : label}
    </button>
  )
}
