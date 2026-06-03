import {
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  getDoc
} from 'firebase/firestore'
import type { MenuCategory, MenuItem, Recipe, RecipeLine } from '@shared/types'
import { collections, doc } from '@renderer/lib/firebase'
import { mapDoc, stripId } from '@renderer/lib/utils/firestore-mapper'
import { generateId } from '@renderer/lib/utils/id'
import { omitUndefined } from '@renderer/lib/utils/firestore-data'

export async function listCategories(): Promise<MenuCategory[]> {
  const snap = await getDocs(
    query(collections.menuCategories(), orderBy('sortOrder'))
  )
  return snap.docs.map((d) => mapDoc<MenuCategory>(d))
}

export async function createCategory(
  nameAr: string,
  sortOrder: number
): Promise<MenuCategory> {
  const now = Date.now()
  const id = generateId()
  const cat: MenuCategory = {
    id,
    nameAr,
    sortOrder,
    active: true,
    createdAt: now,
    updatedAt: now
  }
  await setDoc(
    doc(collections.menuCategories(), id),
    omitUndefined(stripId(cat) as Record<string, unknown>)
  )
  return cat
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<MenuCategory, 'nameAr' | 'sortOrder' | 'active'>>
): Promise<void> {
  await updateDoc(
    doc(collections.menuCategories(), id),
    omitUndefined({ ...patch, updatedAt: Date.now() })
  )
}

async function categoryHasMenuItems(categoryId: string): Promise<boolean> {
  const q = query(collections.menuItems(), where('categoryId', '==', categoryId))
  const snap = await getDocs(q)
  return !snap.empty
}

export async function deleteCategory(id: string): Promise<void> {
  if (await categoryHasMenuItems(id)) {
    throw new Error('لا يمكن الحذف — التصنيف يحتوي أصنافاً. احذف الأصناف أولاً.')
  }
  const ref = doc(collections.menuCategories(), id)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error('التصنيف غير موجود — حدّث الصفحة وحاول مرة أخرى')
  }
  await deleteDoc(ref)
}

export async function listMenuItems(activeOnly = false): Promise<MenuItem[]> {
  const snap = await getDocs(collections.menuItems())
  let items = snap.docs.map((d) => mapDoc<MenuItem>(d))
  if (activeOnly) items = items.filter((i) => i.active)
  return items.sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'))
}

export async function getRecipeByMenuItem(
  menuItemId: string
): Promise<Recipe | null> {
  const q = query(
    collections.recipes(),
    where('menuItemId', '==', menuItemId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDoc<Recipe>(snap.docs[0]!)
}

export async function getRecipe(recipeId: string): Promise<Recipe | null> {
  const snap = await getDoc(doc(collections.recipes(), recipeId))
  if (!snap.exists()) return null
  return mapDoc<Recipe>(snap as never)
}

export async function createMenuItemWithRecipe(params: {
  categoryId: string
  nameAr: string
  descriptionAr?: string
  price: number
  lines: RecipeLine[]
}): Promise<{ item: MenuItem; recipe: Recipe }> {
  const now = Date.now()
  const recipeId = generateId()
  const itemId = generateId()

  const recipe: Recipe = {
    id: recipeId,
    menuItemId: itemId,
    nameAr: params.nameAr,
    lines: params.lines,
    createdAt: now,
    updatedAt: now
  }

  const item: MenuItem = {
    id: itemId,
    categoryId: params.categoryId,
    nameAr: params.nameAr,
    descriptionAr: params.descriptionAr,
    price: params.price,
    active: true,
    recipeId,
    createdAt: now,
    updatedAt: now
  }

  await setDoc(
    doc(collections.recipes(), recipeId),
    omitUndefined(stripId(recipe) as Record<string, unknown>)
  )
  await setDoc(
    doc(collections.menuItems(), itemId),
    omitUndefined(stripId(item) as Record<string, unknown>)
  )
  return { item, recipe }
}

export async function updateMenuItem(
  id: string,
  patch: Partial<
    Pick<MenuItem, 'nameAr' | 'descriptionAr' | 'price' | 'categoryId' | 'active'>
  >
): Promise<void> {
  await updateDoc(
    doc(collections.menuItems(), id),
    omitUndefined({ ...patch, updatedAt: Date.now() })
  )
}

export async function updateRecipe(
  recipeId: string,
  lines: RecipeLine[],
  nameAr?: string
): Promise<void> {
  await updateDoc(doc(collections.recipes(), recipeId), {
    lines,
    ...(nameAr ? { nameAr } : {}),
    updatedAt: Date.now()
  })
}

export async function deleteMenuItem(id: string, recipeId: string): Promise<void> {
  await deleteDoc(doc(collections.menuItems(), id))
  await deleteDoc(doc(collections.recipes(), recipeId))
}
