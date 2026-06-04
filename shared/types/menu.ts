export interface MenuCategory {
  id: string
  nameAr: string
  sortOrder: number
  active: boolean
  createdAt: number
  updatedAt: number
}

export interface MenuItem {
  id: string
  categoryId: string
  nameAr: string
  descriptionAr?: string
  price: number
  imageUrl?: string
  active: boolean
  recipeId: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface RecipeLine {
  ingredientId: string
  quantity: number
  unit: string
}

export interface Recipe {
  id: string
  menuItemId: string
  nameAr: string
  lines: RecipeLine[]
  createdAt: number
  updatedAt: number
}
