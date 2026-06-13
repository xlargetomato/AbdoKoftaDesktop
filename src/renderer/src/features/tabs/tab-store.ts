/**
 * Tab store — manages the browser-like tab bar above the main content.
 * Each tab tracks a route path. Tabs persist for the session.
 */
import { create } from 'zustand'

export interface AppTab {
  id: string
  path: string
  label: string
  /** react-icons icon name key for serialisation */
  iconKey: string
  /** pinned tabs can't be closed */
  pinned?: boolean
}

interface TabState {
  tabs: AppTab[]
  activeId: string | null

  openTab: (tab: Omit<AppTab, 'id'>) => string
  closeTab: (id: string) => string | null   // returns id of tab to activate next
  activateTab: (id: string) => void
  activateByPath: (path: string) => string | null  // returns existing tab id or null
  updateTabLabel: (id: string, label: string) => void
}

let _seq = 0
function uid(): string {
  return `tab-${++_seq}-${Date.now()}`
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeId: null,

  openTab(tabDef) {
    // Reuse existing tab with same path
    const existing = get().tabs.find((t) => t.path === tabDef.path)
    if (existing) {
      set({ activeId: existing.id })
      return existing.id
    }
    const id = uid()
    set((s) => ({
      tabs: [...s.tabs, { ...tabDef, id }],
      activeId: id
    }))
    return id
  },

  closeTab(id) {
    const { tabs, activeId } = get()
    if (tabs.length <= 1) return activeId // never close last tab
    const idx = tabs.findIndex((t) => t.id === id)
    const next = tabs[idx + 1] ?? tabs[idx - 1] ?? null
    set({
      tabs: tabs.filter((t) => t.id !== id),
      activeId: activeId === id ? (next?.id ?? null) : activeId
    })
    return activeId === id ? (next?.id ?? null) : activeId
  },

  activateTab(id) {
    set({ activeId: id })
  },

  activateByPath(path) {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      set({ activeId: existing.id })
      return existing.id
    }
    return null
  },

  updateTabLabel(id, label) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, label } : t))
    }))
  }
}))
