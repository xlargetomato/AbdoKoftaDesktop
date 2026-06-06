import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { MenuCategory, MenuItem, RecipeLine, WeightedPriceOption } from '@shared/types'
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listMenuItems,
  updateMenuItem,
  createMenuItemWithRecipe,
  getRecipe,
  updateRecipe,
  deleteMenuItem,
  reorderCategories,
  reorderMenuItems
} from '@renderer/features/menu/menu-service'
import { listIngredients } from '@renderer/features/inventory/inventory-service'
import { ConfirmDeleteButton } from '@renderer/components/ConfirmDeleteButton'
import { MdArrowUpward, MdArrowDownward, MdEdit, MdCheck, MdClose } from 'react-icons/md'

function moveItem<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const next = [...arr]
  const target = idx + dir
  if (target < 0 || target >= next.length) return next
  ;[next[idx], next[target]] = [next[target]!, next[idx]!]
  return next
}

type WeightedPriceOptionForm = {
  id: string
  label: string
  weightKg: string
  price: string
}

type RecipeLineForm = {
  ingredientId: string
  quantity: string
  unit: string
}

type ItemEditState = {
  id: string
  nameAr: string
  price: string
  categoryId: string
  isWeighted: boolean
  weightedPriceOptions: WeightedPriceOptionForm[]
  allowCustomWeight: boolean
  customWeightUnitPrice: string
  active: boolean
}

function newWeightedOption(): WeightedPriceOptionForm {
  return { id: crypto.randomUUID(), label: '', weightKg: '', price: '' }
}

function toWeightedOptionForm(option: WeightedPriceOption): WeightedPriceOptionForm {
  return {
    id: option.id,
    label: option.label,
    weightKg: String(option.weightKg),
    price: String(option.price)
  }
}

function normalizeWeightedOptions(options: WeightedPriceOptionForm[]): WeightedPriceOption[] {
  return options
    .map((option) => ({
      id: option.id || crypto.randomUUID(),
      label: option.label.trim(),
      weightKg: Number(option.weightKg),
      price: Number(option.price)
    }))
    .filter((option) => option.label && option.weightKg > 0 && option.price >= 0)
}

export function MenuManagementPage(): React.ReactElement {
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [ingredients, setIngredients] = useState<{ id: string; nameAr: string; unit: string }[]>([])
  const [catName, setCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [editingItem, setEditingItem] = useState<ItemEditState | null>(null)
  const [itemForm, setItemForm] = useState({
    categoryId: '',
    nameAr: '',
    price: '',
    isWeighted: false,
    weightedPriceOptions: [newWeightedOption()] as WeightedPriceOptionForm[],
    allowCustomWeight: false,
    customWeightUnitPrice: '',
    lines: [{ ingredientId: '', quantity: '', unit: 'جرام' }] as RecipeLineForm[]
  })
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)

  const load = useCallback(async () => {
    const [cats, menu, ing] = await Promise.all([
      listCategories(), listMenuItems(), listIngredients()
    ])
    setCategories(cats)
    setItems(menu)
    setIngredients(ing.map((i) => ({ id: i.id, nameAr: i.nameAr, unit: i.unit })))
  }, [])

  useEffect(() => { void load() }, [load])

  async function addCategory(e: FormEvent): Promise<void> {
    e.preventDefault()
    setMessage(null)
    try {
      await createCategory(catName.trim(), categories.length)
      setCatName('')
      setMessage('تم إضافة التصنيف')
      await load()
    } catch (err) { setMessage(err instanceof Error ? err.message : 'فشل') }
  }

  async function saveCatName(id: string): Promise<void> {
    if (!editingCatName.trim()) return
    await updateCategory(id, { nameAr: editingCatName.trim() })
    setEditingCatId(null)
    setMessage('تم تعديل التصنيف')
    await load()
  }

  async function moveCat(idx: number, dir: -1 | 1): Promise<void> {
    const next = moveItem(categories, idx, dir).map((c, i) => ({ ...c, sortOrder: i }))
    setCategories(next)
    setSavingOrder(true)
    try { await reorderCategories(next.map((c) => ({ id: c.id, sortOrder: c.sortOrder }))) }
    finally { setSavingOrder(false) }
  }

  function updateWeightedOption(index: number, patch: Partial<WeightedPriceOptionForm>): void {
    setItemForm((form) => {
      const weightedPriceOptions = [...form.weightedPriceOptions]
      weightedPriceOptions[index] = { ...weightedPriceOptions[index]!, ...patch }
      return { ...form, weightedPriceOptions }
    })
  }

  function updateEditingWeightedOption(index: number, patch: Partial<WeightedPriceOptionForm>): void {
    setEditingItem((item) => {
      if (!item) return item
      const weightedPriceOptions = [...item.weightedPriceOptions]
      weightedPriceOptions[index] = { ...weightedPriceOptions[index]!, ...patch }
      return { ...item, weightedPriceOptions }
    })
  }

  function validateWeightedPricing(options: WeightedPriceOption[], allowCustom: boolean, customPrice: string): boolean {
    if (options.length === 0) {
      setMessage('أضف سعر ميزان واحد على الأقل')
      return false
    }
    if (allowCustom && Number(customPrice) <= 0) {
      setMessage('حدد سعر الكيلو للوزن المخصص')
      return false
    }
    return true
  }

  async function addItem(e: FormEvent): Promise<void> {
    e.preventDefault()
    setMessage(null)
    if (!itemForm.categoryId) { setMessage('اختر التصنيف أولاً'); return }
    const lines: RecipeLine[] = itemForm.lines
      .filter((l) => l.ingredientId && l.quantity)
      .map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), unit: l.unit }))
    if (lines.length === 0) { setMessage('أضف مكوّناً واحداً على الأقل'); return }
    const weightedPriceOptions = normalizeWeightedOptions(itemForm.weightedPriceOptions)
    if (itemForm.isWeighted && !validateWeightedPricing(weightedPriceOptions, itemForm.allowCustomWeight, itemForm.customWeightUnitPrice)) return

    try {
      await createMenuItemWithRecipe({
        categoryId: itemForm.categoryId,
        nameAr: itemForm.nameAr.trim(),
        price: Number(itemForm.price),
        isWeighted: itemForm.isWeighted,
        weightedPriceOptions,
        allowCustomWeight: itemForm.isWeighted ? itemForm.allowCustomWeight : undefined,
        customWeightUnitPrice: itemForm.isWeighted && itemForm.allowCustomWeight ? Number(itemForm.customWeightUnitPrice) : undefined,
        lines,
        sortOrder: items.length
      })
      setItemForm({
        categoryId: itemForm.categoryId,
        nameAr: '',
        price: '',
        isWeighted: false,
        weightedPriceOptions: [newWeightedOption()],
        allowCustomWeight: false,
        customWeightUnitPrice: '',
        lines: [{ ingredientId: '', quantity: '', unit: 'جرام' }]
      })
      setMessage('تم حفظ الصنف')
      await load()
    } catch (err) { setMessage(err instanceof Error ? err.message : 'فشل') }
  }

  async function saveItemEdit(): Promise<void> {
    if (!editingItem) return
    const weightedPriceOptions = normalizeWeightedOptions(editingItem.weightedPriceOptions)
    if (editingItem.isWeighted && !validateWeightedPricing(weightedPriceOptions, editingItem.allowCustomWeight, editingItem.customWeightUnitPrice)) return
    await updateMenuItem(editingItem.id, {
      nameAr: editingItem.nameAr.trim(),
      price: Number(editingItem.price),
      categoryId: editingItem.categoryId,
      isWeighted: editingItem.isWeighted,
      weightedPriceOptions: editingItem.isWeighted ? weightedPriceOptions : [],
      allowCustomWeight: editingItem.isWeighted ? editingItem.allowCustomWeight : false,
      customWeightUnitPrice: editingItem.isWeighted && editingItem.allowCustomWeight ? Number(editingItem.customWeightUnitPrice) : undefined,
      active: editingItem.active
    })
    setEditingItem(null)
    setMessage('تم تعديل الصنف')
    await load()
  }

  async function moveMenuItem(idx: number, dir: -1 | 1): Promise<void> {
    const next = moveItem(items, idx, dir).map((it, i) => ({ ...it, sortOrder: i }))
    setItems(next)
    setSavingOrder(true)
    try { await reorderMenuItems(next.map((it) => ({ id: it.id, sortOrder: it.sortOrder }))) }
    finally { setSavingOrder(false) }
  }

  async function openRecipe(item: MenuItem): Promise<void> {
    const recipe = await getRecipe(item.recipeId)
    if (recipe) {
      setEditingRecipeId(item.recipeId)
      setRecipeLines(recipe.lines)
    }
  }

  async function saveRecipe(): Promise<void> {
    if (!editingRecipeId) return
    await updateRecipe(editingRecipeId, recipeLines)
    setEditingRecipeId(null)
    setMessage('تم تعديل الوصفة')
  }

  function startEditItem(item: MenuItem): void {
    setEditingItem({
      id: item.id,
      nameAr: item.nameAr,
      price: String(item.price),
      categoryId: item.categoryId,
      isWeighted: !!item.isWeighted,
      weightedPriceOptions: (item.weightedPriceOptions ?? []).map(toWeightedOptionForm),
      allowCustomWeight: !!item.allowCustomWeight,
      customWeightUnitPrice: item.customWeightUnitPrice != null ? String(item.customWeightUnitPrice) : '',
      active: item.active
    })
  }

  return (
    <>
      {message && (
        <p className={`form-message ${message.includes('فشل') || message.includes('لا يمكن') ? 'form-message--error' : 'form-message--ok'}`} role="status">
          {message}
        </p>
      )}
      {savingOrder && <p className="form-message" role="status">جارٍ حفظ الترتيب...</p>}

      <div className="card">
        <h2 className="card__title">التصنيفات</h2>
        <form onSubmit={(e) => void addCategory(e)} className="page-toolbar">
          <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="اسم التصنيف" required />
          <button type="submit" className="btn btn--primary">إضافة تصنيف</button>
        </form>
        <ul className="category-list">
          {categories.map((c, idx) => (
            <li key={c.id} className="category-list__item">
              <div className="sort-arrows">
                <button type="button" className="sort-arrow-btn" disabled={idx === 0} onClick={() => void moveCat(idx, -1)} aria-label="أعلى"><MdArrowUpward /></button>
                <button type="button" className="sort-arrow-btn" disabled={idx === categories.length - 1} onClick={() => void moveCat(idx, 1)} aria-label="أسفل"><MdArrowDownward /></button>
              </div>
              {editingCatId === c.id ? (
                <input
                  className="inline-edit-input"
                  value={editingCatName}
                  onChange={(e) => setEditingCatName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveCatName(c.id); if (e.key === 'Escape') setEditingCatId(null) }}
                />
              ) : (
                <span>{c.nameAr} {!c.active && <em style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>(معطّل)</em>}</span>
              )}
              <div className="table-actions">
                {editingCatId === c.id ? (
                  <>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveCatName(c.id)}><MdCheck /> حفظ</button>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditingCatId(null)}><MdClose /></button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setEditingCatId(c.id); setEditingCatName(c.nameAr) }}>
                      <MdEdit /> تعديل
                    </button>
                    <button type="button" className={`btn btn--sm ${c.active ? 'btn--secondary' : 'btn--danger'}`} onClick={() => void updateCategory(c.id, { active: !c.active }).then(load)}>
                      {c.active ? 'مفعّل' : 'معطّل'}
                    </button>
                    <ConfirmDeleteButton confirmMessage={`حذف تصنيف "${c.nameAr}"؟`} onConfirm={async () => { await deleteCategory(c.id); setMessage(`تم حذف "${c.nameAr}"`); await load() }} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2 className="card__title">إضافة صنف + وصفة</h2>
        <form onSubmit={(e) => void addItem(e)}>
          <label className="field">
            <span>التصنيف</span>
            <select value={itemForm.categoryId} onChange={(e) => setItemForm((f) => ({ ...f, categoryId: e.target.value }))} required>
              <option value="">اختر...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
            </select>
          </label>
          <label className="field">
            <span>اسم الصنف</span>
            <input value={itemForm.nameAr} onChange={(e) => setItemForm((f) => ({ ...f, nameAr: e.target.value }))} required />
          </label>
          <label className="field">
            <span>{itemForm.isWeighted ? 'سعر افتراضي للكيلو' : 'السعر'}</span>
            <input type="number" min="0" step="0.01" value={itemForm.price} onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))} required />
          </label>
          <label className="field field--checkbox">
            <input type="checkbox" checked={itemForm.isWeighted} onChange={(e) => setItemForm((f) => ({ ...f, isWeighted: e.target.checked }))} />
            <span>منتج ميزان - الوصفة لكل 1 كجم</span>
          </label>

          {itemForm.isWeighted && (
            <div className="weighted-pricing-editor">
              <h3>أسعار أزرار الميزان</h3>
              {itemForm.weightedPriceOptions.map((option, idx) => (
                <div key={option.id} className="weighted-pricing-row">
                  <input value={option.label} onChange={(e) => updateWeightedOption(idx, { label: e.target.value })} placeholder="اسم الزر مثل 1/2" />
                  <input type="number" min="0" step="0.001" value={option.weightKg} onChange={(e) => updateWeightedOption(idx, { weightKg: e.target.value })} placeholder="الوزن بالكيلو" />
                  <input type="number" min="0" step="0.01" value={option.price} onChange={(e) => updateWeightedOption(idx, { price: e.target.value })} placeholder="السعر" />
                  <button type="button" className="btn btn--danger btn--sm" onClick={() => setItemForm((f) => ({ ...f, weightedPriceOptions: f.weightedPriceOptions.filter((_, i) => i !== idx) }))}><MdClose /></button>
                </div>
              ))}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setItemForm((f) => ({ ...f, weightedPriceOptions: [...f.weightedPriceOptions, newWeightedOption()] }))}>+ سعر ميزان</button>
              <label className="field field--checkbox weighted-pricing-custom">
                <input type="checkbox" checked={itemForm.allowCustomWeight} onChange={(e) => setItemForm((f) => ({ ...f, allowCustomWeight: e.target.checked }))} />
                <span>السماح بوزن مخصص</span>
              </label>
              {itemForm.allowCustomWeight && (
                <label className="field">
                  <span>سعر الكيلو للوزن المخصص</span>
                  <input type="number" min="0" step="0.01" value={itemForm.customWeightUnitPrice} onChange={(e) => setItemForm((f) => ({ ...f, customWeightUnitPrice: e.target.value }))} required />
                </label>
              )}
            </div>
          )}

          <h3 style={{ margin: '12px 0 8px', fontWeight: 700 }}>مكوّنات الوصفة</h3>
          {itemForm.lines.map((line, idx) => (
            <div key={idx} className="page-toolbar" style={{ gap: 6 }}>
              <select value={line.ingredientId} onChange={(e) => {
                const lines = [...itemForm.lines]
                const ing = ingredients.find((i) => i.id === e.target.value)
                lines[idx] = { ...lines[idx]!, ingredientId: e.target.value, unit: ing?.unit ?? 'جرام' }
                setItemForm((f) => ({ ...f, lines }))
              }}>
                <option value="">مكوّن...</option>
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
              </select>
              <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => {
                const lines = [...itemForm.lines]
                lines[idx] = { ...lines[idx]!, quantity: e.target.value }
                setItemForm((f) => ({ ...f, lines }))
              }} style={{ width: 80 }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>{line.unit}</span>
              {itemForm.lines.length > 1 && (
                <button type="button" className="btn btn--danger btn--sm" onClick={() => setItemForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))}><MdClose /></button>
              )}
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setItemForm((f) => ({ ...f, lines: [...f.lines, { ingredientId: '', quantity: '', unit: 'جرام' }] }))}>+ سطر وصفة</button>
            <button type="submit" className="btn btn--primary">حفظ الصنف</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card__title">أصناف القائمة</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '1%' }}>ترتيب</th>
              <th>الاسم</th>
              <th>السعر</th>
              <th>التصنيف</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const isEditing = editingItem?.id === item.id
              return (
                <tr key={item.id}>
                  <td>
                    <div className="sort-arrows">
                      <button type="button" className="sort-arrow-btn" disabled={idx === 0} onClick={() => void moveMenuItem(idx, -1)} aria-label="أعلى"><MdArrowUpward /></button>
                      <button type="button" className="sort-arrow-btn" disabled={idx === items.length - 1} onClick={() => void moveMenuItem(idx, 1)} aria-label="أسفل"><MdArrowDownward /></button>
                    </div>
                  </td>
                  <td>{isEditing ? <input className="inline-edit-input" value={editingItem.nameAr} onChange={(e) => setEditingItem({ ...editingItem, nameAr: e.target.value })} autoFocus /> : item.nameAr}</td>
                  <td>{isEditing ? <input className="inline-edit-input" type="number" step="0.01" value={editingItem.price} onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })} style={{ width: 80 }} /> : item.price.toFixed(2)}</td>
                  <td>{isEditing ? (
                    <select className="inline-edit-input" value={editingItem.categoryId} onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
                    </select>
                  ) : (categories.find((c) => c.id === item.categoryId)?.nameAr ?? '-')}</td>
                  <td>{isEditing ? (
                    <select className="inline-edit-input" value={editingItem.active ? 'active' : 'inactive'} onChange={(e) => setEditingItem({ ...editingItem, active: e.target.value === 'active' })}>
                      <option value="active">مفعّل</option>
                      <option value="inactive">معطّل</option>
                    </select>
                  ) : (
                    <span style={{ color: item.active ? 'var(--color-success)' : 'var(--color-muted)', fontWeight: 700, fontSize: '0.82rem' }}>{item.active ? 'مفعّل' : 'معطّل'}</span>
                  )}</td>
                  <td>
                    <div className="table-actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveItemEdit()}><MdCheck /> حفظ</button>
                          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditingItem(null)}><MdClose /></button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn btn--secondary btn--sm" onClick={() => startEditItem(item)}><MdEdit /> تعديل</button>
                          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void openRecipe(item)}>الوصفة</button>
                          <ConfirmDeleteButton confirmMessage={`حذف "${item.nameAr}" ووصفته؟`} onConfirm={async () => { await deleteMenuItem(item.id, item.recipeId); await load() }} />
                        </>
                      )}
                    </div>
                    {isEditing && editingItem.isWeighted && (
                      <div className="weighted-pricing-editor weighted-pricing-editor--inline">
                        <label className="field field--checkbox">
                          <input type="checkbox" checked={editingItem.isWeighted} onChange={(e) => setEditingItem({ ...editingItem, isWeighted: e.target.checked })} />
                          <span>منتج ميزان</span>
                        </label>
                        {editingItem.weightedPriceOptions.map((option, optionIdx) => (
                          <div key={option.id} className="weighted-pricing-row">
                            <input value={option.label} onChange={(e) => updateEditingWeightedOption(optionIdx, { label: e.target.value })} placeholder="اسم الزر" />
                            <input type="number" min="0" step="0.001" value={option.weightKg} onChange={(e) => updateEditingWeightedOption(optionIdx, { weightKg: e.target.value })} placeholder="كجم" />
                            <input type="number" min="0" step="0.01" value={option.price} onChange={(e) => updateEditingWeightedOption(optionIdx, { price: e.target.value })} placeholder="السعر" />
                            <button type="button" className="btn btn--danger btn--sm" onClick={() => setEditingItem({ ...editingItem, weightedPriceOptions: editingItem.weightedPriceOptions.filter((_, i) => i !== optionIdx) })}><MdClose /></button>
                          </div>
                        ))}
                        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditingItem({ ...editingItem, weightedPriceOptions: [...editingItem.weightedPriceOptions, newWeightedOption()] })}>+ سعر ميزان</button>
                        <label className="field field--checkbox weighted-pricing-custom">
                          <input type="checkbox" checked={editingItem.allowCustomWeight} onChange={(e) => setEditingItem({ ...editingItem, allowCustomWeight: e.target.checked })} />
                          <span>السماح بوزن مخصص</span>
                        </label>
                        {editingItem.allowCustomWeight && (
                          <input className="inline-edit-input" type="number" min="0" step="0.01" value={editingItem.customWeightUnitPrice} onChange={(e) => setEditingItem({ ...editingItem, customWeightUnitPrice: e.target.value })} placeholder="سعر الكيلو المخصص" />
                        )}
                      </div>
                    )}
                    {isEditing && !editingItem.isWeighted && (
                      <label className="field field--checkbox weighted-pricing-editor--inline">
                        <input type="checkbox" checked={editingItem.isWeighted} onChange={(e) => setEditingItem({ ...editingItem, isWeighted: e.target.checked, weightedPriceOptions: [newWeightedOption()] })} />
                        <span>منتج ميزان</span>
                      </label>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editingRecipeId && (
        <div className="modal-overlay" onClick={() => setEditingRecipeId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px' }}>تعديل الوصفة</h2>
            {recipeLines.map((line, idx) => (
              <div key={idx} className="page-toolbar" style={{ gap: 6, marginBottom: 8 }}>
                <select value={line.ingredientId} onChange={(e) => {
                  const next = [...recipeLines]
                  const ing = ingredients.find((i) => i.id === e.target.value)
                  next[idx] = { ...next[idx]!, ingredientId: e.target.value, unit: ing?.unit ?? line.unit }
                  setRecipeLines(next)
                }}>
                  {ingredients.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
                </select>
                <input type="number" value={line.quantity} style={{ width: 80 }} onChange={(e) => {
                  const next = [...recipeLines]
                  next[idx] = { ...next[idx]!, quantity: Number(e.target.value) }
                  setRecipeLines(next)
                }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>{line.unit}</span>
                <button type="button" className="btn btn--danger btn--sm" onClick={() => setRecipeLines((l) => l.filter((_, i) => i !== idx))} aria-label="حذف سطر"><MdClose /></button>
              </div>
            ))}
            <div className="form-actions">
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setRecipeLines((l) => [...l, { ingredientId: ingredients[0]?.id ?? '', quantity: 1, unit: ingredients[0]?.unit ?? 'جرام' }])}>+ إضافة مكوّن</button>
              <button type="button" className="btn btn--primary" onClick={() => void saveRecipe()}>حفظ الوصفة</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}