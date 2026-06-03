export type InventoryTransactionType =
  | 'purchase'
  | 'sale'
  | 'waste'
  | 'adjustment'

export interface Ingredient {
  id: string
  nameAr: string
  unit: string
  lowStockThreshold?: number
  active: boolean
  createdAt: number
  updatedAt: number
}

export interface InventoryTransaction {
  id: string
  ingredientId: string
  type: InventoryTransactionType
  /** Signed quantity in base unit (positive = in, negative = out) */
  quantity: number
  unit: string
  referenceType?: 'order' | 'purchase' | 'manual'
  referenceId?: string
  noteAr?: string
  createdBy: string
  createdAt: number
}

export interface IngredientStock {
  ingredientId: string
  nameAr: string
  unit: string
  quantity: number
  lowStockThreshold?: number
}
