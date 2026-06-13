import { useRef, useEffect, useState } from 'react'
import { MdClose } from 'react-icons/md'
import { useSplitStore, type SplitPane } from './split-store'
import { TabContextMenu } from './TabContextMenu'
import { NAV_ICON_MAP } from '@renderer/config/navigation'

interface TabBarProps {
  pane: SplitPane
  isFocused: boolean
  onActivate: (paneId: string, tabId: string) => void
  onClose: (paneId: string, tabId: string) => void
  onSplit: (paneId: string, tabId: string) => void
  onFocus: (paneId: string) => void
}

interface ContextMenuState {
  x: number
  y: number
  tabId: string
}

export function TabBar({
  pane,
  isFocused,
  onActivate,
  onClose,
  onSplit,
  onFocus
}: TabBarProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const panes = useSplitStore((s) => s.panes)

  // Scroll active tab into view
  useEffect(() => {
    if (!scrollRef.current) return
    const active = scrollRef.current.querySelector('.tab--active')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [pane.activeTabId])

  function handleMouseDown(e: React.MouseEvent, tabId: string): void {
    if (e.button === 1) { e.preventDefault(); onClose(pane.id, tabId) }
  }

  function handleContextMenu(e: React.MouseEvent, tabId: string): void {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  const totalTabs = panes.reduce((sum, p) => sum + p.tabs.length, 0)

  return (
    <>
      <div
        className={`tab-bar${isFocused ? ' tab-bar--focused' : ''}`}
        role="tablist"
        aria-label="التبويبات"
        onMouseDown={() => onFocus(pane.id)}
      >
        <div className="tab-bar__scroll" ref={scrollRef}>
          {pane.tabs.map((tab) => {
            const Icon = NAV_ICON_MAP[tab.iconKey]
            const isActive = tab.id === pane.activeTabId
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                className={`tab${isActive && isFocused ? ' tab--active' : isActive ? ' tab--active tab--active-unfocused' : ''}`}
                onClick={() => onActivate(pane.id, tab.id)}
                onMouseDown={(e) => handleMouseDown(e, tab.id)}
                onContextMenu={(e) => handleContextMenu(e, tab.id)}
              >
                {Icon && <Icon className="tab__icon" aria-hidden="true" />}
                <span className="tab__label">{tab.label}</span>
                {totalTabs > 1 && (
                  <button
                    type="button"
                    className="tab__close"
                    aria-label={`إغلاق ${tab.label}`}
                    onClick={(e) => { e.stopPropagation(); onClose(pane.id, tab.id) }}
                  >
                    <MdClose />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {ctxMenu && (
        <TabContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          tabId={ctxMenu.tabId}
          paneId={pane.id}
          canSplit={pane.tabs.length > 1}
          onSplit={() => onSplit(pane.id, ctxMenu.tabId)}
          onClose={() => onClose(pane.id, ctxMenu.tabId)}
          onDismiss={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}
