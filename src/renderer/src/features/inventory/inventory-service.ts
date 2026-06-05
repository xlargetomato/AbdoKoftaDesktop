import {
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where
} from 'firebase/firestore'
import type {
  Ingredient,
  InventoryTransaction,
  InventoryTransactionType,
  IngredientStock
} from '@shared/types'
import { calculateAllStocks } from '@shared/services/inventory-ledger'
import { collections, doc } from '@renderer/lib/firebase'
import { mapDoc, stripId } from '@renderer/lib/utils/firestore-mapper'
import { generateId } from '@renderer/lib/utils/id'
import { omitUndefined } from '@renderer/lib/utils/firestore-data'
import { trackWrite } from '../sync/sync-store'

export async function listIngredients(): Promise<Ingredient[]> {
  const snap = await getDocs(
    query(collections.ingredients(), orderBy('nameAr'))
  )
  return snap.docs.map((d) => mapDoc<Ingredient>(d))
}

export async function createIngredient(
  data: Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Ingredient> {
  const now = Date.now()
  const id = generateId()
  const ingredient: Ingredient = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now
  }
  await setDoc(
    doc(collections.ingredients(), id),
    omitUndefined(stripId(ingredient) as Record<string, unknown>)
  )
  return ingredient
}

export async function updateIngredient(
  id: string,
  patch: Partial<Pick<Ingredient, 'nameAr' | 'unit' | 'lowStockThreshold' | 'active'>>
): Promise<void> {
  await updateDoc(
    doc(collections.ingredients(), id),
    omitUndefined({ ...patch, updatedAt: Date.now() })
  )
}

async function isIngredientUsedInRecipes(ingredientId: string): Promise<boolean> {
  const snap = await getDocs(collections.recipes())
  return snap.docs.some((d) => {
    const lines = (d.data().lines ?? []) as Array<{ ingredientId: string }>
    return lines.some((l) => l.ingredientId === ingredientId)
  })
}

export async function deleteIngredient(id: string): Promise<void> {
  if (await isIngredientUsedInRecipes(id)) {
    throw new Error('لا يمكن الحذف — المكوّن مستخدم في وصفة. احذف الصنف من القائمة أولاً.')
  }
  await deleteDoc(doc(collections.ingredients(), id))
}

/** All stock changes go through this — never update stock directly */
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
  await trackWrite(() =>
    setDoc(
      doc(collections.inventoryTransactions(), tx.id),
      omitUndefined(tx as unknown as Record<string, unknown>)
    )
  )
  return tx
}

export async function listInventoryTransactions(
  ingredientId?: string
): Promise<InventoryTransaction[]> {
  const base = query(
    collections.inventoryTransactions(),
    orderBy('createdAt', 'desc')
  )
  const q = ingredientId
    ? query(base, where('ingredientId', '==', ingredientId))
    : base
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapDoc<InventoryTransaction>(d))
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

/** Signed quantity: positive = add stock, negative = remove */
export async function recordAdjustment(params: {
  ingredientId: string
  quantity: number
  unit: string
  noteAr?: string
  createdBy: string
}): Promise<InventoryTransaction> {
  if (params.quantity === 0) {
    throw new Error('كمية التسوية يجب أن تكون غير صفر')
  }
  return recordInventoryTransaction({
    ...params,
    type: 'adjustment',
    quantity: params.quantity,
    referenceType: 'manual',
    noteAr: params.noteAr ?? 'تسوية مخزون'
  })
}
