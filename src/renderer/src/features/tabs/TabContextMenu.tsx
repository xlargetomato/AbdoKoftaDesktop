import { useEffect, useRef } from 'react'
import { MdVerticalSplit, MdClose } from 'react-icons/md'

interface TabContextMenuProps {
  x: number
  y: number
  tabId: string
  paneId: string
  canSplit: boolean  // false if this is the only tab in pane
  onSplit: () => void
  onClose: () => void
  onDismiss: () => void
}

export function TabContextMenu({
  x, y, canSplit, onSplit, onClose, onDismiss
}: TabContextMenuProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  // Adjust position so menu doesn't go off-screen
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right > vw) el.style.left = `${vw - rect.width - 8}px`
    if (rect.bottom > vh) el.style.top = `${vh - rect.height - 8}px`
  }, [])

  // Dismiss on outside click or Escape
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onDismiss])

  return (
    <div
      ref={ref}
      className="tab-ctx-menu"
      style={{ position: 'fixed', top: y, left: x, zIndex: 9999 }}
      role="menu"
    >
      {canSplit && (
        <button
          type="button"
          className="tab-ctx-menu__item"
          role="menuitem"
          onClick={() => { onSplit(); onDismiss() }}
        >
          <MdVerticalSplit className="tab-ctx-menu__icon" aria-hidden="true" />
          فتح في عرض مقسم
        </button>
      )}
      <button
        type="button"
        className="tab-ctx-menu__item tab-ctx-menu__item--danger"
        role="menuitem"
        onClick={() => { onClose(); onDismiss() }}
      >
        <MdClose className="tab-ctx-menu__icon" aria-hidden="true" />
        إغلاق التبويب
      </button>
    </div>
  )
}
