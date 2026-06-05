import type { IconType } from 'react-icons'
import {
  MdPointOfSale,
  MdHistory,
  MdDashboard,
  MdKitchen,
  MdInventory,
  MdMenuBook,
  MdPeople,
  MdBarChart,
  MdSettings,
  MdLogout,
  MdPersonSearch,
  MdWorkHistory
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
  end?: boolean
  children?: NavSubItem[]
}

export const CASHIER_NAV: NavItem[] = [
  { to: '/pos', label: 'نقطة البيع', hint: 'إنشاء طلبات وبيع', icon: MdPointOfSale },
  { to: '/pos/inventory', label: 'توريد ومصروفات', hint: 'مخزون ومصاريف الدرج', icon: MdInventory },
  { to: '/pos/history', label: 'سجل الطلبات', hint: 'عرض وإلغاء الطلبات', icon: MdHistory }
]

export const MANAGER_NAV: NavItem[] = [
  { to: '/manager', label: 'لوحة التحكم', hint: 'ملخص اليوم والوصول السريع', icon: MdDashboard, end: true },
  { to: '/manager/ingredients', label: 'المكونات', hint: 'إدارة مكونات الوصفات', icon: MdKitchen },
  { to: '/manager/inventory', label: 'المخزون', hint: 'شراء، هدر، وتسوية', icon: MdInventory },
  { to: '/manager/menu', label: 'القائمة', hint: 'أصناف وتصنيفات ووصفات', icon: MdMenuBook },
  { to: '/manager/cashiers', label: 'الكاشيرات', hint: 'حسابات وكود كل كاشير', icon: MdPeople },
  { to: '/manager/shifts', label: 'الشيفتات', hint: 'مراجعة وتقفيل وأرشفة', icon: MdWorkHistory },
  { to: '/manager/suppliers', label: 'الموردين', hint: 'حسابات وتوريدات الموردين', icon: MdPersonSearch },
  { to: '/manager/cashier-history', label: 'سجل الكاشيرات', hint: 'أوردرات الكاشير اليومية', icon: MdHistory },
  { to: '/manager/reports', label: 'التقارير', hint: 'إيرادات وملخصات', icon: MdBarChart },
  { to: '/manager/settings', label: 'الإعدادات', hint: 'اسم المطعم والعملة', icon: MdSettings }
]

export function navLinkEnd(item: NavItem): boolean {
  return item.end ?? (item.to === '/manager' || item.to === '/pos')
}
