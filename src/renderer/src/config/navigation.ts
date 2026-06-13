import type { IconType } from 'react-icons'
import {
  MdPointOfSale,
  MdHistory,
  MdDashboard,
  MdInventory,
  MdMenuBook,
  MdPeople,
  MdBarChart,
  MdSettings,
  MdLogout,
  MdPersonSearch,
  MdWorkHistory,
  MdShoppingCart
} from 'react-icons/md'

export { MdLogout }

export interface NavSubItem {
  to: string
  label: string
}

export interface NavItem {
  to: string
  label: string
  hint?: string
  icon: IconType
  iconKey: string
  end?: boolean
  children?: NavSubItem[]
}

export const NAV_ICON_MAP: Record<string, IconType> = {
  MdPointOfSale,
  MdHistory,
  MdDashboard,
  MdInventory,
  MdMenuBook,
  MdPeople,
  MdBarChart,
  MdSettings,
  MdPersonSearch,
  MdWorkHistory,
  MdShoppingCart
}

// Cashier: only POS routes
export const CASHIER_NAV: NavItem[] = [
  { to: '/pos',           label: '\u0646\u0642\u0637\u0629 \u0627\u0644\u0628\u064a\u0639',          hint: '\u0625\u0646\u0634\u0627\u0621 \u0637\u0644\u0628\u0627\u062a \u0648\u0628\u064a\u0639',           icon: MdPointOfSale, iconKey: 'MdPointOfSale' },
  { to: '/pos/inventory', label: '\u062a\u0648\u0631\u064a\u062f \u0648\u0645\u0635\u0631\u0648\u0641\u0627\u062a', hint: '\u0645\u062e\u0632\u0648\u0646 \u0648\u0645\u0635\u0627\u0631\u064a\u0641 \u0627\u0644\u062f\u0631\u062c', icon: MdInventory,   iconKey: 'MdInventory' },
  { to: '/pos/history',   label: '\u0633\u062c\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062a',     hint: '\u0639\u0631\u0636 \u0648\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u0637\u0644\u0628\u0627\u062a',  icon: MdHistory,     iconKey: 'MdHistory' }
]

// Supervisor: uses /supervisor/ prefix to avoid route conflicts with manager
export const SUPERVISOR_NAV: NavItem[] = [
  { to: '/pos',                  label: '\u0646\u0642\u0637\u0629 \u0627\u0644\u0628\u064a\u0639',          hint: '\u0625\u0646\u0634\u0627\u0621 \u0637\u0644\u0628\u0627\u062a \u0648\u0628\u064a\u0639',           icon: MdPointOfSale,  iconKey: 'MdPointOfSale' },
  { to: '/pos/inventory',        label: '\u062a\u0648\u0631\u064a\u062f \u0648\u0645\u0635\u0631\u0648\u0641\u0627\u062a', hint: '\u0645\u062e\u0632\u0648\u0646 \u0648\u0645\u0635\u0627\u0631\u064a\u0641 \u0627\u0644\u062f\u0631\u062c', icon: MdInventory,    iconKey: 'MdInventory' },
  { to: '/pos/history',          label: '\u0633\u062c\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062a',     hint: '\u0639\u0631\u0636 \u0648\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u0637\u0644\u0628\u0627\u062a',  icon: MdHistory,      iconKey: 'MdHistory' },
  { to: '/supervisor/shifts',    label: '\u0627\u0644\u0634\u064a\u0641\u062a\u0627\u062a',              hint: '\u0645\u0631\u0627\u062c\u0639\u0629 \u0648\u062a\u0642\u0641\u064a\u0644 \u0648\u0623\u0631\u0634\u0641\u0629', icon: MdWorkHistory,  iconKey: 'MdWorkHistory' },
  { to: '/supervisor/purchases', label: '\u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a',           hint: '\u0645\u062e\u0632\u0648\u0646 \u0648\u0634\u0631\u0627\u0621 \u0648\u0647\u062f\u0631',           icon: MdShoppingCart, iconKey: 'MdShoppingCart' },
  { to: '/supervisor/suppliers', label: '\u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646',               hint: '\u062d\u0633\u0627\u0628\u0627\u062a \u0648\u062a\u0648\u0631\u064a\u062f\u0627\u062a \u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646', icon: MdPersonSearch, iconKey: 'MdPersonSearch' },
  { to: '/supervisor/reports',   label: '\u0627\u0644\u062a\u0642\u0627\u0631\u064a\u0631',               hint: '\u0625\u064a\u0631\u0627\u062f\u0627\u062a \u0648\u0645\u0644\u062e\u0635\u0627\u062a',           icon: MdBarChart,     iconKey: 'MdBarChart' }
]

// Manager: full access under /manager/
export const MANAGER_NAV: NavItem[] = [
  { to: '/manager',                 label: '\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645',    hint: '\u0645\u0644\u062e\u0635 \u0627\u0644\u064a\u0648\u0645 \u0648\u0627\u0644\u0648\u0635\u0648\u0644 \u0627\u0644\u0633\u0631\u064a\u0639', icon: MdDashboard,    iconKey: 'MdDashboard',   end: true },
  { to: '/manager/items',           label: '\u0627\u0644\u0623\u0635\u0646\u0627\u0641',        hint: '\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0648\u0627\u0644\u062a\u0635\u0646\u064a\u0641\u0627\u062a \u0648\u0627\u0644\u0648\u0635\u0641\u0627\u062a', icon: MdMenuBook,     iconKey: 'MdMenuBook' },
  { to: '/manager/purchases',       label: '\u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a',  hint: '\u0645\u062e\u0632\u0648\u0646 \u0648\u0634\u0631\u0627\u0621 \u0648\u0647\u062f\u0631',           icon: MdShoppingCart, iconKey: 'MdShoppingCart' },
  { to: '/manager/cashiers',        label: '\u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a',   hint: '\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646 \u0648\u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0627\u062a', icon: MdPeople,       iconKey: 'MdPeople' },
  { to: '/manager/shifts',          label: '\u0627\u0644\u0634\u064a\u0641\u062a\u0627\u062a',   hint: '\u0645\u0631\u0627\u062c\u0639\u0629 \u0648\u062a\u0642\u0641\u064a\u0644 \u0648\u0623\u0631\u0634\u0641\u0629', icon: MdWorkHistory,  iconKey: 'MdWorkHistory' },
  { to: '/manager/suppliers',       label: '\u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646',   hint: '\u062d\u0633\u0627\u0628\u0627\u062a \u0648\u062a\u0648\u0631\u064a\u062f\u0627\u062a \u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646', icon: MdPersonSearch, iconKey: 'MdPersonSearch' },
  { to: '/manager/cashier-history', label: '\u0633\u062c\u0644 \u0627\u0644\u0643\u0627\u0634\u064a\u0631\u0627\u062a', hint: '\u0623\u0648\u0631\u062f\u0631\u0627\u062a \u0627\u0644\u0643\u0627\u0634\u064a\u0631 \u0627\u0644\u064a\u0648\u0645\u064a\u0629', icon: MdHistory, iconKey: 'MdHistory' },
  { to: '/manager/reports',         label: '\u0627\u0644\u062a\u0642\u0627\u0631\u064a\u0631',   hint: '\u0625\u064a\u0631\u0627\u062f\u0627\u062a \u0648\u0645\u0644\u062e\u0635\u0627\u062a',           icon: MdBarChart,     iconKey: 'MdBarChart' },
  { to: '/manager/settings',        label: '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a', hint: '\u0627\u0633\u0645 \u0627\u0644\u0645\u0637\u0639\u0645 \u0648\u0627\u0644\u0639\u0645\u0644\u0629', icon: MdSettings,     iconKey: 'MdSettings' }
]

export function navLinkEnd(item: NavItem): boolean {
  return item.end ?? (item.to === '/manager' || item.to === '/pos')
}
