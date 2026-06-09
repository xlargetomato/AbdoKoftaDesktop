export interface MenuCategory {
  id: string
  parentId?: string
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
  sizeOptions?: MenuItemSizeOption[]
  attachments?: MenuItemAttachment[]
  isWeighted?: boolean
  weightedPriceOptions?: WeightedPriceOption[]
  allowCustomWeight?: boolean
  customWeightUnitPrice?: number
  imageUrl?: string
  active: boolean
  recipeId: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface MenuItemSizeOption {
  id: string
  labelAr: string
  price: number
}

export interface MenuItemAttachment {
  id: string
  nameAr: string
  price: number
}

export interface WeightedPriceOption {
  id: string
  label: string
  weightKg: number
  price: number
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
  basisQuantity?: number
  basisUnit?: string
  lines: RecipeLine[]
  createdAt: number
  updatedAt: number
}
