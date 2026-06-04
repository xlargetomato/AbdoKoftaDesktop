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
  MdAssessment,
  MdPersonSearch
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
  { to: '/pos',         label: 'نقطة البيع',   hint: 'إنشاء طلبات وبيع',       icon: MdPointOfSale },
  { to: '/pos/history', label: 'سجل الطلبات',  hint: 'عرض الطلبات السابقة',     icon: MdHistory     }
]

export const MANAGER_NAV: NavItem[] = [
  { to: '/manager',              label: 'لوحة التحكم', hint: 'ملخص اليوم والوصول السريع', icon: MdDashboard,  end: true },
  { to: '/manager/ingredients',  label: 'المكوّنات',   hint: 'إدارة مكوّنات الوصفات',     icon: MdKitchen               },
  { to: '/manager/inventory',    label: 'المخزون',     hint: 'شراء، هدر، وتسوية',         icon: MdInventory             },
  { to: '/manager/menu',         label: 'القائمة',     hint: 'أصناف وتصنيفات ووصفات',     icon: MdMenuBook              },
  { to: '/manager/cashiers',     label: 'الكاشيرات',   hint: 'حسابات الكاشير',            icon: MdPeople                },
  {
    to: '/manager/reports',
    label: 'التقارير',
    hint: 'إيرادات وملخصات',
    icon: MdBarChart,
    children: [
      { to: '/manager/reports',         label: 'ملخص المبيعات' },
      { to: '/manager/cashier-history', label: 'سجل الكاشيرات' }
    ]
  },
  { to: '/manager/settings',     label: 'الإعدادات',   hint: 'اسم المطعم والعملة',        icon: MdSettings              }
]

export function navLinkEnd(item: NavItem): boolean {
  return item.end ?? (item.to === '/manager' || item.to === '/pos')
}
