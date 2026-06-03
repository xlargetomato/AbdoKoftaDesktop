import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { MenuCategory, MenuItem, RecipeLine } from '@shared/types'
import {
  listCategories,
  createCategory,
  deleteCategory,
  listMenuItems,
  createMenuItemWithRecipe,
  getRecipe,
  updateRecipe,
  deleteMenuItem
} from '@renderer/features/menu/menu-service'
import { listIngredients } from '@renderer/features/inventory/inventory-service'
import { ConfirmDeleteButton } from '@renderer/components/ConfirmDeleteButton'

export function MenuManagementPage(): React.ReactElement {
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [ingredients, setIngredients] = useState<{ id: string; nameAr: string; unit: string }[]>([])
  const [catName, setCatName] = useState('')
  const [itemForm, setItemForm] = useState({
    categoryId: '',
    nameAr: '',
    price: '',
    lines: [{ ingredientId: '', quantity: '', unit: 'جرام' }] as Array<{
      ingredientId: string
      quantity: string
      unit: string
    }>
  })
  const [editingRecipe, setEditingRecipe] = useState<string | null>(null)
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [cats, menu, ing] = await Promise.all([
      listCategories(),
      listMenuItems(),
      listIngredients()
    ])
    setCategories(cats)
    setItems(menu)
    setIngredients(ing.map((i) => ({ id: i.id, nameAr: i.nameAr, unit: i.unit })))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function addCategory(e: FormEvent): Promise<void> {
    e.preventDefault()
    setMessage(null)
    try {
      await createCategory(catName.trim(), categories.length)
      setCatName('')
      setMessage('تم إضافة التصنيف')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'فشل إضافة التصنيف')
    }
  }

  async function addItem(e: FormEvent): Promise<void> {
    e.preventDefault()
    setMessage(null)
    if (!itemForm.categoryId) {
      setMessage('اختر التصنيف أولاً')
      return
    }
    const lines: RecipeLine[] = itemForm.lines
      .filter((l) => l.ingredientId && l.quantity)
      .map((l) => ({
        ingredientId: l.ingredientId,
        quantity: Number(l.quantity),
        unit: l.unit
      }))
    if (lines.length === 0) {
      setMessage('أضف مكوّناً واحداً على الأقل في الوصفة')
      return
    }
    try {
      await createMenuItemWithRecipe({
        categoryId: itemForm.categoryId,
        nameAr: itemForm.nameAr.trim(),
        price: Number(itemForm.price),
        lines
      })
      setItemForm({
        categoryId: itemForm.categoryId,
        nameAr: '',
        price: '',
        lines: [{ ingredientId: '', quantity: '', unit: 'جرام' }]
      })
      setMessage('تم حفظ الصنف بنجاح')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'فشل حفظ الصنف')
    }
  }

  async function openRecipe(item: MenuItem): Promise<void> {
    const recipe = await getRecipe(item.recipeId)
    if (recipe) {
      setEditingRecipe(item.recipeId)
      setRecipeLines(recipe.lines)
    }
  }

  async function saveRecipe(): Promise<void> {
    if (!editingRecipe) return
    await updateRecipe(editingRecipe, recipeLines)
    setEditingRecipe(null)
  }

  return (
    <>
      {message && (
        <p
          className={
            message.includes('فشل') || message.includes('لا يمكن')
              ? 'form-message form-message--error'
              : 'form-message form-message--ok'
          }
          role="status"
        >
          {message}
        </p>
      )}
      <div className="card">
        <h2 className="card__title">التصنيفات</h2>
        <form onSubmit={(e) => void addCategory(e)} className="page-toolbar">
          <input
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="اسم التصنيف"
            required
          />
          <button type="submit" className="btn btn--primary">
            إضافة تصنيف
          </button>
        </form>
        <ul className="category-list">
          {categories.map((c) => (
            <li key={c.id} className="category-list__item">
              <span>
                {c.nameAr} {!c.active && '(معطّل)'}
              </span>
              <ConfirmDeleteButton
                confirmMessage={`حذف تصنيف "${c.nameAr}"؟`}
                onConfirm={async () => {
                  await deleteCategory(c.id)
                  setMessage(`تم حذف تصنيف "${c.nameAr}"`)
                  await load()
                }}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2 className="card__title">صنف قائمة + وصفة</h2>
        <form onSubmit={(e) => void addItem(e)}>
          <label className="field">
            <span>التصنيف</span>
            <select
              value={itemForm.categoryId}
              onChange={(e) =>
                setItemForm((f) => ({ ...f, categoryId: e.target.value }))
              }
              required
            >
              <option value="">اختر...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>اسم الصنف</span>
            <input
              value={itemForm.nameAr}
              onChange={(e) => setItemForm((f) => ({ ...f, nameAr: e.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>السعر</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={itemForm.price}
              onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
              required
            />
          </label>
          <h3>مكوّنات الوصفة</h3>
          {itemForm.lines.map((line, idx) => (
            <div key={idx} className="page-toolbar">
              <select
                value={line.ingredientId}
                onChange={(e) => {
                  const lines = [...itemForm.lines]
                  const ing = ingredients.find((i) => i.id === e.target.value)
                  lines[idx] = {
                    ...lines[idx]!,
                    ingredientId: e.target.value,
                    unit: ing?.unit ?? 'جرام'
                  }
                  setItemForm((f) => ({ ...f, lines }))
                }}
              >
                <option value="">مكوّن...</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nameAr}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="الكمية"
                value={line.quantity}
                onChange={(e) => {
                  const lines = [...itemForm.lines]
                  lines[idx] = { ...lines[idx]!, quantity: e.target.value }
                  setItemForm((f) => ({ ...f, lines }))
                }}
              />
              <span>{line.unit}</span>
            </div>
          ))}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() =>
                setItemForm((f) => ({
                  ...f,
                  lines: [...f.lines, { ingredientId: '', quantity: '', unit: 'جرام' }]
                }))
              }
            >
              + سطر وصفة
            </button>
            <button type="submit" className="btn btn--primary">
              حفظ الصنف
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card__title">أصناف القائمة</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>السعر</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.nameAr}</td>
                <td>{item.price.toFixed(2)}</td>
                <td>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => void openRecipe(item)}
                    >
                      الوصفة
                    </button>
                    <ConfirmDeleteButton
                      confirmMessage={`حذف "${item.nameAr}" ووصفته؟`}
                      onConfirm={async () => {
                        await deleteMenuItem(item.id, item.recipeId)
                        await load()
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingRecipe && (
        <div className="modal-overlay" onClick={() => setEditingRecipe(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>تعديل الوصفة</h2>
            {recipeLines.map((line, idx) => (
              <div key={idx} className="page-toolbar">
                <select
                  value={line.ingredientId}
                  onChange={(e) => {
                    const next = [...recipeLines]
                    const ing = ingredients.find((i) => i.id === e.target.value)
                    next[idx] = {
                      ...next[idx]!,
                      ingredientId: e.target.value,
                      unit: ing?.unit ?? line.unit
                    }
                    setRecipeLines(next)
                  }}
                >
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nameAr}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={line.quantity}
                  onChange={(e) => {
                    const next = [...recipeLines]
                    next[idx] = { ...next[idx]!, quantity: Number(e.target.value) }
                    setRecipeLines(next)
                  }}
                />
              </div>
            ))}
            <button type="button" className="btn btn--primary" onClick={() => void saveRecipe()}>
              حفظ
            </button>
          </div>
        </div>
      )}
    </>
  )
}
