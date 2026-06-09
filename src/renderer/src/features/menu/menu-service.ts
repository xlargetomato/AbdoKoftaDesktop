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
import { COLLECTIONS } from '@shared/constants/collections'
import {
  cacheDocs,
  getCachedDoc,
  getCachedDocs,
  isAppOffline,
  mergeAndCacheLocalFirst,
  mergeDocAndCacheLocalFirst
} from '@renderer/lib/offline/sqlite-cache'

export async function listCategories(): Promise<MenuCategory[]> {
  if (isAppOffline()) {
    return (await getCachedDocs<MenuCategory>(COLLECTIONS.menuCategories)).sort(
      (a, b) => a.sortOrder - b.sortOrder
    )
  }
  try {
    const snap = await getDocs(
      query(collections.menuCategories(), orderBy('sortOrder'))
    )
    const remoteCategories = snap.docs.map((d) => mapDoc<MenuCategory>(d))
    const categories = await mergeAndCacheLocalFirst(COLLECTIONS.menuCategories, remoteCategories)
    return categories
      .sort((a, b) => a.sortOrder - b.sortOrder)
  } catch (e) {
    const categories = await getCachedDocs<MenuCategory>(COLLECTIONS.menuCategories)
    if (categories.length) return categories.sort((a, b) => a.sortOrder - b.sortOrder)
    throw e
  }
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
  if (isAppOffline()) {
    await cacheDocs(COLLECTIONS.menuCategories, [cat])
    return cat
  }
  await setDoc(
    doc(collections.menuCategories(), id),
    omitUndefined(stripId(cat) as Record<string, unknown>)
  )
  await cacheDocs(COLLECTIONS.menuCategories, [cat])
  return cat
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<MenuCategory, 'nameAr' | 'sortOrder' | 'active'>>
): Promise<void> {
  if (isAppOffline()) {
    const cached = await getCachedDoc<MenuCategory>(COLLECTIONS.menuCategories, id)
    if (cached) await cacheDocs(COLLECTIONS.menuCategories, [{ ...cached, ...patch, updatedAt: Date.now() }])
    return
  }
  await updateDoc(
    doc(collections.menuCategories(), id),
    omitUndefined({ ...patch, updatedAt: Date.now() })
  )
}

export async function updateMenuItem(
  id: string,
  patch: Partial<Pick<MenuItem, 'nameAr' | 'price' | 'categoryId' | 'isWeighted' | 'weightedPriceOptions' | 'allowCustomWeight' | 'customWeightUnitPrice' | 'active'>>
): Promise<void> {
  if (isAppOffline()) {
    const cached = await getCachedDoc<MenuItem>(COLLECTIONS.menuItems, id)
    if (cached) await cacheDocs(COLLECTIONS.menuItems, [{ ...cached, ...patch, updatedAt: Date.now() }])
    return
  }
  await updateDoc(
    doc(collections.menuItems(), id),
    omitUndefined({ ...patch, updatedAt: Date.now() })
  )
}

async function categoryHasMenuItems(categoryId: string): Promise<boolean> {
  const q = query(collections.menuItems(), where('categoryId', '==', categoryId))
  const snap = await getDocs(q)
  return !snap.empty
}

export async function deleteCategory(id: string): Promise<void> {
  if (isAppOffline()) throw new Error('لا يمكن الحذف أثناء عدم الاتصال')
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
  let items: MenuItem[]
  if (isAppOffline()) {
    items = await getCachedDocs<MenuItem>(COLLECTIONS.menuItems)
  } else {
    try {
      const snap = await getDocs(collections.menuItems())
      const remoteItems = snap.docs.map((d) => mapDoc<MenuItem>(d))
      items = await mergeAndCacheLocalFirst(COLLECTIONS.menuItems, remoteItems)
    } catch (e) {
      items = await getCachedDocs<MenuItem>(COLLECTIONS.menuItems)
      if (!items.length) throw e
    }
  }
  if (activeOnly) items = items.filter((i) => i.active)
  // Sort by sortOrder, fallback to name for items without it
  return items.sort((a, b) => {
    const ao = a.sortOrder ?? 9999
    const bo = b.sortOrder ?? 9999
    if (ao !== bo) return ao - bo
    return a.nameAr.localeCompare(b.nameAr, 'ar')
  })
}

export async function reorderMenuItems(
  items: Array<{ id: string; sortOrder: number }>
): Promise<void> {
  if (isAppOffline()) {
    const cached = await getCachedDocs<MenuItem>(COLLECTIONS.menuItems)
    const sortById = new Map(items.map((item) => [item.id, item.sortOrder]))
    await cacheDocs(
      COLLECTIONS.menuItems,
      cached
        .filter((item) => sortById.has(item.id))
        .map((item) => ({ ...item, sortOrder: sortById.get(item.id), updatedAt: Date.now() }))
    )
    return
  }
  await Promise.all(
    items.map(({ id, sortOrder }) =>
      updateDoc(doc(collections.menuItems(), id), { sortOrder, updatedAt: Date.now() })
    )
  )
}

export async function reorderCategories(
  cats: Array<{ id: string; sortOrder: number }>
): Promise<void> {
  if (isAppOffline()) {
    const cached = await getCachedDocs<MenuCategory>(COLLECTIONS.menuCategories)
    const sortById = new Map(cats.map((cat) => [cat.id, cat.sortOrder]))
    await cacheDocs(
      COLLECTIONS.menuCategories,
      cached
        .filter((cat) => sortById.has(cat.id))
        .map((cat) => ({ ...cat, sortOrder: sortById.get(cat.id) ?? cat.sortOrder, updatedAt: Date.now() }))
    )
    return
  }
  await Promise.all(
    cats.map(({ id, sortOrder }) =>
      updateCategory(id, { sortOrder })
    )
  )
}

export async function getRecipeByMenuItem(
  menuItemId: string
): Promise<Recipe | null> {
  if (isAppOffline()) {
    const recipes = await getCachedDocs<Recipe>(COLLECTIONS.recipes)
    return recipes.find((r) => r.menuItemId === menuItemId) ?? null
  }
  try {
    const q = query(
      collections.recipes(),
      where('menuItemId', '==', menuItemId)
    )
    const snap = await getDocs(q)
    const remoteRecipes = snap.docs.map((d) => mapDoc<Recipe>(d))
    const recipes = await mergeAndCacheLocalFirst(COLLECTIONS.recipes, remoteRecipes)
    return recipes.find((r) => r.menuItemId === menuItemId) ?? null
  } catch (e) {
    const recipes = await getCachedDocs<Recipe>(COLLECTIONS.recipes)
    const recipe = recipes.find((r) => r.menuItemId === menuItemId)
    if (recipe) return recipe
    throw e
  }
}

export async function getRecipe(recipeId: string): Promise<Recipe | null> {
  if (isAppOffline()) {
    return getCachedDoc<Recipe>(COLLECTIONS.recipes, recipeId)
  }
  try {
    const snap = await getDoc(doc(collections.recipes(), recipeId))
    const recipe = snap.exists() ? mapDoc<Recipe>(snap as never) : null
    return await mergeDocAndCacheLocalFirst(COLLECTIONS.recipes, recipe, recipeId)
  } catch (e) {
    const recipe = await getCachedDoc<Recipe>(COLLECTIONS.recipes, recipeId)
    if (recipe) return recipe
    throw e
  }
}

export async function createMenuItemWithRecipe(params: {
  categoryId: string
  nameAr: string
  descriptionAr?: string
  price: number
  isWeighted?: boolean
  weightedPriceOptions?: MenuItem['weightedPriceOptions']
  allowCustomWeight?: boolean
  customWeightUnitPrice?: number
  lines: RecipeLine[]
  sortOrder?: number
}): Promise<{ item: MenuItem; recipe: Recipe }> {
  const now = Date.now()
  const recipeId = generateId()
  const itemId = generateId()

  const recipe: Recipe = {
    id: recipeId,
    menuItemId: itemId,
    nameAr: params.nameAr,
    basisQuantity: params.isWeighted ? 1 : undefined,
    basisUnit: params.isWeighted ? 'kg' : undefined,
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
    isWeighted: params.isWeighted,
    weightedPriceOptions: params.isWeighted ? params.weightedPriceOptions : undefined,
    allowCustomWeight: params.isWeighted ? params.allowCustomWeight : undefined,
    customWeightUnitPrice: params.isWeighted ? params.customWeightUnitPrice : undefined,
    active: true,
    recipeId,
    sortOrder: params.sortOrder ?? 9999,
    createdAt: now,
    updatedAt: now
  }

  if (isAppOffline()) {
    await Promise.all([
      cacheDocs(COLLECTIONS.menuItems, [item]),
      cacheDocs(COLLECTIONS.recipes, [recipe])
    ])
    return { item, recipe }
  }

  await setDoc(
    doc(collections.recipes(), recipeId),
    omitUndefined(stripId(recipe) as Record<string, unknown>)
  )
  await setDoc(
    doc(collections.menuItems(), itemId),
    omitUndefined(stripId(item) as Record<string, unknown>)
  )
  await Promise.all([
    cacheDocs(COLLECTIONS.menuItems, [item]),
    cacheDocs(COLLECTIONS.recipes, [recipe])
  ])
  return { item, recipe }
}

export async function updateRecipe(
  recipeId: string,
  lines: RecipeLine[],
  nameAr?: string
): Promise<void> {
  if (isAppOffline()) {
    const cached = await getCachedDoc<Recipe>(COLLECTIONS.recipes, recipeId)
    if (cached) {
      await cacheDocs(COLLECTIONS.recipes, [{
        ...cached,
        lines,
        ...(nameAr ? { nameAr } : {}),
        updatedAt: Date.now()
      }])
    }
    return
  }
  await updateDoc(doc(collections.recipes(), recipeId), {
    lines,
    ...(nameAr ? { nameAr } : {}),
    updatedAt: Date.now()
  })
}

export async function deleteMenuItem(id: string, recipeId: string): Promise<void> {
  if (isAppOffline()) throw new Error('لا يمكن الحذف أثناء عدم الاتصال')
  await deleteDoc(doc(collections.menuItems(), id))
  await deleteDoc(doc(collections.recipes(), recipeId))
}
