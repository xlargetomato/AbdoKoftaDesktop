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
  updatedAt: number
}
