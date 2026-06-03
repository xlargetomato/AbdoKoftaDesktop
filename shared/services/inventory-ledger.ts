import type { InventoryTransaction, Recipe, RecipeLine } from '../types'

/** Stock = sum of all transaction quantities for an ingredient */
export function calculateStockFromTransactions(
  ingredientId: string,
  transactions: InventoryTransaction[]
): number {
  return transactions
    .filter((t) => t.ingredientId === ingredientId)
    .reduce((sum, t) => sum + t.quantity, 0)
}

export function calculateAllStocks(
  ingredientIds: string[],
  transactions: InventoryTransaction[]
): Map<string, number> {
  const map = new Map<string, number>()
  for (const id of ingredientIds) {
    map.set(id, calculateStockFromTransactions(id, transactions))
  }
  return map
}

/** Deduction lines for one menu item qty from recipe */
export function recipeDeductionLines(
  recipe: Recipe,
  orderQuantity: number
): Array<{ ingredientId: string; quantity: number; unit: string }> {
  return recipe.lines.map((line: RecipeLine) => ({
    ingredientId: line.ingredientId,
    quantity: -(line.quantity * orderQuantity),
    unit: line.unit
  }))
}

export function mergeDeductionLines(
  lines: Array<{ ingredientId: string; quantity: number; unit: string }>
): Array<{ ingredientId: string; quantity: number; unit: string }> {
  const merged = new Map<string, { quantity: number; unit: string }>()
  for (const line of lines) {
    const existing = merged.get(line.ingredientId)
    if (existing) {
      existing.quantity += line.quantity
    } else {
      merged.set(line.ingredientId, {
        quantity: line.quantity,
        unit: line.unit
      })
    }
  }
  return Array.from(merged.entries()).map(([ingredientId, v]) => ({
    ingredientId,
    quantity: v.quantity,
    unit: v.unit
  }))
}
