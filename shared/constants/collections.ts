/** Firestore collection names — shared with future React Native app */
export const COLLECTIONS = {
  users: 'users',
  menuCategories: 'menu_categories',
  menuItems: 'menu_items',
  recipes: 'recipes',
  ingredients: 'ingredients',
  inventoryTransactions: 'inventory_transactions',
  orders: 'orders',
  orderItems: 'order_items',
  payments: 'payments',
  settings: 'settings'
} as const

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]
