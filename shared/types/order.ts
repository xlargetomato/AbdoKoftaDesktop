export type OrderStatus = 'draft' | 'completed' | 'cancelled'
export type OrderType = 'takeaway' | 'dine_in'
export type PaymentStatus = 'paid' | 'unpaid'

export interface Order {
  id: string
  orderNumber: number
  orderCode?: string
  status: OrderStatus
  orderType?: OrderType
  paymentStatus?: PaymentStatus
  tableId?: string
  tableNameAr?: string
  tableCategoryAr?: string
  shiftId?: string
  cashierId: string
  cashierName: string
  cashierCode?: string
  subtotal: number
  total: number
  noteAr?: string
  archived?: boolean
  createdAt: number
  updatedAt: number
  completedAt?: number
  paidAt?: number
  cancelledAt?: number
  cancelledBy?: string
  cancelReasonAr?: string
  cancelInventoryMode?: 'return' | 'waste'
}

export interface OrderItem {
  id: string
  orderId: string
  menuItemId: string
  nameAr: string
  unitPrice: number
  quantity: number
  unitLabel?: string
  weightGrams?: number
  lineTotal: number
  noteAr?: string
}

export interface Payment {
  id: string
  orderId: string
  amount: number
  method: 'cash' | 'card'
  createdAt: number
}
