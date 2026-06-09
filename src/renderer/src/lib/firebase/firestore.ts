import {
  getFirestore,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence,
  collection,
  doc,
  type Firestore
} from 'firebase/firestore'
import { getFirebaseApp } from './app'
import { COLLECTIONS } from '@shared/constants/collections'

let db: Firestore
let persistenceEnabled = false

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp())
  }
  return db
}

export async function enableOfflinePersistence(): Promise<void> {
  if (persistenceEnabled) return
  const firestore = getDb()
  try {
    await enableMultiTabIndexedDbPersistence(firestore)
  } catch {
    try {
      await enableIndexedDbPersistence(firestore)
    } catch (e) {
      console.warn('Firestore persistence unavailable', e)
    }
  }
  persistenceEnabled = true
}

export const collections = {
  users: () => collection(getDb(), COLLECTIONS.users),
  menuCategories: () => collection(getDb(), COLLECTIONS.menuCategories),
  menuItems: () => collection(getDb(), COLLECTIONS.menuItems),
  recipes: () => collection(getDb(), COLLECTIONS.recipes),
  ingredients: () => collection(getDb(), COLLECTIONS.ingredients),
  inventoryTransactions: () =>
    collection(getDb(), COLLECTIONS.inventoryTransactions),
  orders: () => collection(getDb(), COLLECTIONS.orders),
  orderItems: () => collection(getDb(), COLLECTIONS.orderItems),
  payments: () => collection(getDb(), COLLECTIONS.payments),
  diningTables: () => collection(getDb(), COLLECTIONS.diningTables),
  shifts: () => collection(getDb(), COLLECTIONS.shifts),
  cashDrawerTransactions: () =>
    collection(getDb(), COLLECTIONS.cashDrawerTransactions),
  suppliers: () => collection(getDb(), COLLECTIONS.suppliers),
  supplierTransactions: () =>
    collection(getDb(), COLLECTIONS.supplierTransactions),
  settings: () => collection(getDb(), COLLECTIONS.settings)
}

export { doc, collection }
