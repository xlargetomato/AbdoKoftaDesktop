import type { Order } from '../types/order'

export function orderReference(order: Pick<Order, 'orderCode' | 'orderNumber'>): string {
  return order.orderCode ?? String(order.orderNumber)
}
