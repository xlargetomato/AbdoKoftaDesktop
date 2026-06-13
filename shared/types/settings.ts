export interface AppSettings {
  id: string
  restaurantNameAr: string
  currencySymbol: string
  phoneNumber?: string
  receiptFooterAr?: string
  primaryColor?: string
  pinEnabled: boolean
  autoLockMinutes: number   // 0 = never auto-lock
  nextOrderNumber: number
  /** VAT/tax percentage — 0 means no tax. e.g. 14 = 14% */
  taxRate?: number
  /** Default delivery fee added to delivery orders */
  defaultDeliveryFee?: number
  updatedAt: number
}
