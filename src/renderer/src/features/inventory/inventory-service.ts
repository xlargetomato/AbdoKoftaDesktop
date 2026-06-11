/**
 * Inventory service — SQLite primary database.
 */
import type {
  Ingredient,
  InventoryTransaction,
  InventoryTransactionType,
  IngredientStock
} from '@shared/types'
import { calculateAllStocks } from '@shared/services/inventory-ledger'
import { COLLECTIONS } from '@shared/constants/collections'
import { cacheDocs, getCachedDocs } from '@renderer/lib/offline/sqlite-cache'
import { dbDelete } from '@renderer/lib/db/sqlite-db'
import { generateId } from '@renderer/lib/utils/id'

export async function listIngredients(): Promise<Ingredient[]> {
  const ingredients = await getCachedDocs<Ingredient>(COLLECTIONS.ingredients)
  return ingredients.sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'))
}

export async function createIngredient(
  data: Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Ingredient> {
  const now = Date.now()
  const ingredient: Ingredient = { ...data, id: generateId(), createdAt: now, updatedAt: now }
  await cacheDocs(COLLECTIONS.ingredients, [ingredient])
  return ingredient
}

export async function updateIngredient(
  id: string,
  patch: Partial<Pick<Ingredient, 'nameAr' | 'unit' | 'lowStockThreshold' | 'active'>>
): Promise<void> {
  const ingredients = await getCachedDocs<Ingredient>(COLLECTIONS.ingredients)
  const cached = ingredients.find((i) => i.id === id)
  if (!cached) return
  await cacheDocs(COLLECTIONS.ingredients, [{ ...cached, ...patch, updatedAt: Date.now() }])
}

export async function deleteIngredient(id: string): Promise<void> {
  // Check if used in any recipe
  const recipes = await getCachedDocs<{ lines?: Array<{ ingredientId: string }> }>(
    COLLECTIONS.recipes
  )
  const used = recipes.some((r) => (r.lines ?? []).some((l) => l.ingredientId === id))
  if (used) {
    throw new Error('لا يمكن الحذف — المكوّن مستخدم في وصفة. احذف الصنف من القائمة أولاً.')
  }
  await dbDelete(COLLECTIONS.ingredients, id)
}

export async function recordInventoryTransaction(params: {
  ingredientId: string
  type: InventoryTransactionType
  quantity: number
  unit: string
  referenceType?: InventoryTransaction['referenceType']
  referenceId?: string
  noteAr?: string
  createdBy: string
  shiftId?: string
  supplierId?: string
}): Promise<InventoryTransaction> {
  const tx: InventoryTransaction = {
    id: generateId(),
    ingredientId: params.ingredientId,
    type: params.type,
    quantity: params.quantity,
    unit: params.unit,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    shiftId: params.shiftId,
    supplierId: params.supplierId,
    noteAr: params.noteAr,
    createdBy: params.createdBy,
    createdAt: Date.now()
  }
  await cacheDocs(COLLECTIONS.inventoryTransactions, [tx])
  return tx
}

export async function listInventoryTransactions(
  ingredientId?: string
): Promise<InventoryTransaction[]> {
  let txs = await getCachedDocs<InventoryTransaction>(COLLECTIONS.inventoryTransactions)
  if (ingredientId) txs = txs.filter((tx) => tx.ingredientId === ingredientId)
  return txs.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getIngredientStocks(): Promise<IngredientStock[]> {
  const [ingredients, transactions] = await Promise.all([
    listIngredients(),
    listInventoryTransactions()
  ])
  const stocks = calculateAllStocks(
    ingredients.map((i) => i.id),
    transactions
  )
  return ingredients
    .filter((i) => i.active)
    .map((i) => ({
      ingredientId: i.id,
      nameAr: i.nameAr,
      unit: i.unit,
      quantity: stocks.get(i.id) ?? 0,
      lowStockThreshold: i.lowStockThreshold
    }))
}

export async function recordPurchase(params: {
  ingredientId: string
  quantity: number
  unit: string
  noteAr?: string
  createdBy: string
  shiftId?: string
  supplierId?: string
}): Promise<InventoryTransaction> {
  return recordInventoryTransaction({
    ...params,
    type: 'purchase',
    quantity: Math.abs(params.quantity),
    referenceType: 'purchase'
  })
}

export async function recordWaste(params: {
  ingredientId: string
  quantity: number
  unit: string
  noteAr?: string
  createdBy: string
}): Promise<InventoryTransaction> {
  return recordInventoryTransaction({
    ...params,
    type: 'waste',
    quantity: -Math.abs(params.quantity),
    referenceType: 'manual',
    noteAr: params.noteAr ?? 'هدر'
  })
}

export async function recordAdjustment(params: {
  ingredientId: string
  quantity: number
  unit: string
  noteAr?: string
  createdBy: string
}): Promise<InventoryTransaction> {
  if (params.quantity === 0) throw new Error('كمية التسوية يجب أن تكون غير صفر')
  return recordInventoryTransaction({
    ...params,
    type: 'adjustment',
    quantity: params.quantity,
    referenceType: 'manual',
    noteAr: params.noteAr ?? 'تسوية مخزون'
  })
}
