export interface CartLineInput {
  unitPrice: number
  quantity: number
}

export function lineTotal(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * quantity * 100) / 100
}

export function orderSubtotal(lines: CartLineInput[]): number {
  const sum = lines.reduce(
    (acc, l) => acc + lineTotal(l.unitPrice, l.quantity),
    0
  )
  return Math.round(sum * 100) / 100
}

/** Total equals subtotal — no tax in this system */
export function orderTotal(subtotal: number): number {
  return Math.round(subtotal * 100) / 100
}
