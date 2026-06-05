export type ShiftStatus = 'open' | 'closed'

export interface Shift {
  id: string
  cashierId: string
  cashierName: string
  cashierCode?: string
  status: ShiftStatus
  archived?: boolean
  openedAt: number
  closedAt?: number
  closedBy?: string
  createdAt: number
  updatedAt: number
}
