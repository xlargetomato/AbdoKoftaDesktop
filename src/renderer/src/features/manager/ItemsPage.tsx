/**
 * أصناف — unified menu page
 * Tabs: التصنيفات | الأصناف
 * Replaces the old MenuManagementPage entirely.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type {
  MenuCategory,
  MenuItem,
  MenuItemAttachment,
  MenuItemSizeOption,
  RecipeLine,
  WeightedPriceOption
} from '@shared/types'
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
import {
  MdArrowUpward, MdArrowDownward, MdEdit, MdCheck,
  MdClose, MdMenuBook, MdCategory
} from 'react-icons/md'
import { usePageState } from '@renderer/features/tabs/page-state-store'

// ── helpers ────────────────────────────────────────────────────────────────

function moveItem<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const next = [...arr]
  const target = idx + dir
  if (target < 0 || target >= next.length) return next
  ;[next[idx], next[target]] = [next[target]!, next[idx]!]
  return next
}

type WeightedPriceOptionForm = { id: string; label: string; weightGrams: string; price: string }
type SizeOptionForm           = { id: string; labelAr: string; price: string }
type AttachmentForm           = { id: string; nameAr: string; price: string }
type RecipeLineForm           = { ingredientId: string; quantity: string; unit: string }

type ItemEditState = {
  id: string; nameAr: string; price: string; categoryId: string
  sizeOptions: SizeOptionForm[]; attachments: AttachmentForm[]
  isWeighted: boolean; weightedPriceOptions: WeightedPriceOptionForm[]
  allowCustomWeight: boolean; customWeightUnitPrice: string; active: boolean
}

function newWeightedOption(kiloPreset = false): WeightedPriceOptionForm {
  return { id: crypto.randomUUID(), label: kiloPreset ? '1 كجم' : '', weightGrams: kiloPreset ? '1000' : '', price: '' }
}
function newSizeOption(): SizeOptionForm  { return { id: crypto.randomUUID(), labelAr: '', price: '' } }
function newAttachment(): AttachmentForm  { return { id: crypto.randomUUID(), nameAr: '', price: '' } }

function toWeightedOptionForm(o: WeightedPriceOption): WeightedPriceOptionForm {
  return { id: o.id, label: o.label, weightGrams: String(Math.round(o.weightKg * 1000)), price: String(o.price) }
}
function toSizeOptionForm(o: MenuItemSizeOption): SizeOptionForm {
  return { id: o.id, labelAr: o.labelAr, price: String(o.price) }
}
function toAttachmentForm(o: MenuItemAttachment): AttachmentForm {
  return { id: o.id, nameAr: o.nameAr, price: String(o.price) }
}
function normalizeWeightedOptions(opts: WeightedPriceOptionForm[]): WeightedPriceOption[] {
  return opts.map((o) => ({ id: o.id || crypto.randomUUID(), label: o.label.trim(), weightKg: Number(o.weightGrams) / 1000, price: Number(o.price) }))
    .filter((o) => o.label && o.weightKg > 0 && o.price >= 0)
}
function normalizeSizeOptions(opts: SizeOptionForm[]): MenuItemSizeOption[] {
  return opts.map((o) => ({ id: o.id || crypto.randomUUID(), labelAr: o.labelAr.trim(), price: Number(o.price) }))
    .filter((o) => o.labelAr && o.price >= 0)
}
function normalizeAttachments(opts: AttachmentForm[]): MenuItemAttachment[] {
  return opts.map((o) => ({ id: o.id || crypto.randomUUID(), nameAr: o.nameAr.trim(), price: Number(o.price) }))
    .filter((o) => o.nameAr && o.price >= 0)
}

// ── CategoriesTab ───────────────────────────────────────────────────────────

function CategoriesTab({ categories, onRefresh, setMessage }: {
  categories: MenuCategory[]
  onRefresh: () => Promise<void>
  setMessage: (m: string | null) => void
}): React.ReactElement {
  const [catName, setCatName] = useState('')
  const [catParentId, setCatParentId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingParentId, setEditingParentId] = useState('')
  const [savingOrder, setSavingOrder] = useState(false)

  async function addCategory(e: FormEvent): Promise<void> {
    e.preventDefault()
    try {
      await createCategory(catName.trim(), categories.length, catParentId || undefined)
      setCatName(''); setCatParentId('')
      setMessage('تم إضافة التصنيف')
      await onRefresh()
    } catch (err) { setMessage(err instanceof Error ? err.message : 'فشل') }
  }

  async function saveCatEdit(id: string): Promise<void> {
    if (!editingName.trim()) return
    await updateCategory(id, { nameAr: editingName.trim(), parentId: editingParentId || undefined })
    setEditingId(null)
    setMessage('تم تعديل التصنيف')
    await onRefresh()
  }

  async function moveCat(idx: number, dir: -1 | 1): Promise<void> {
    const next = moveItem(categories, idx, dir).map((c, i) => ({ ...c, sortOrder: i }))
    setSavingOrder(true)
    try { await reorderCategories(next.map((c) => ({ id: c.id, sortOrder: c.sortOrder }))) }
    finally { setSavingOrder(false); await onRefresh() }
  }

  return (
    <div className="tab-content">
      <div className="card">
        <h2 className="card__title">إضافة تصنيف</h2>
        <form onSubmit={(e) => void addCategory(e)} className="page-toolbar">
          <label className="field" style={{ flex: 1, margin: 0 }}>
            <span>اسم التصنيف</span>
            <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="مثال: مشروبات" required />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>مجموعة أعلى</span>
            <select value={catParentId} onChange={(e) => setCatParentId(e.target.value)}>
              <option value="">رئيسية</option>
              {categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
            </select>
          </label>
          <button type="submit" className="btn btn--primary" style={{ alignSelf: 'flex-end' }}>إضافة</button>
        </form>
      </div>

      {savingOrder && <p className="form-message" role="status">جارٍ حفظ الترتيب...</p>}

      <div className="card">
        <h2 className="card__title">التصنيفات ({categories.length})</h2>
        {categories.length === 0 && <p className="report-empty">لا توجد تصنيفات بعد</p>}
        <ul className="category-list">
          {categories.map((c, idx) => (
            <li key={c.id} className="category-list__item">
              <div className="sort-arrows">
                <button type="button" className="sort-arrow-btn" disabled={idx === 0} onClick={() => void moveCat(idx, -1)} aria-label="أعلى"><MdArrowUpward /></button>
                <button type="button" className="sort-arrow-btn" disabled={idx === categories.length - 1} onClick={() => void moveCat(idx, 1)} aria-label="أسفل"><MdArrowDownward /></button>
              </div>

              {editingId === c.id ? (
                <div className="page-toolbar" style={{ gap: 6, flex: 1 }}>
                  <input className="inline-edit-input" value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void saveCatEdit(c.id); if (e.key === 'Escape') setEditingId(null) }} />
                  <select className="inline-edit-input" value={editingParentId} onChange={(e) => setEditingParentId(e.target.value)}>
                    <option value="">بدون مجموعة</option>
                    {categories.filter((p) => p.id !== c.id && !p.parentId).map((p) => <option key={p.id} value={p.id}>داخل: {p.nameAr}</option>)}
                  </select>
                </div>
              ) : (
                <span style={{ flex: 1 }}>
                  {c.nameAr}
                  {c.parentId && <em style={{ color: 'var(--color-muted)', fontSize: '0.78rem', marginRight: 6 }}>← {categories.find((p) => p.id === c.parentId)?.nameAr}</em>}
                  {!c.active && <em style={{ color: 'var(--color-muted)', fontSize: '0.78rem', marginRight: 6 }}>(معطّل)</em>}
                </span>
              )}

              <div className="table-actions">
                {editingId === c.id ? (
                  <>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveCatEdit(c.id)}><MdCheck /> حفظ</button>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditingId(null)}><MdClose /></button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setEditingId(c.id); setEditingName(c.nameAr); setEditingParentId(c.parentId ?? '') }}><MdEdit /> تعديل</button>
                    <button type="button" className={`btn btn--sm ${c.active ? 'btn--secondary' : 'btn--danger'}`} onClick={() => void updateCategory(c.id, { active: !c.active }).then(onRefresh)}>{c.active ? 'مفعّل' : 'معطّل'}</button>
                    <ConfirmDeleteButton confirmMessage={`حذف تصنيف "${c.nameAr}"؟`} onConfirm={async () => { await deleteCategory(c.id); setMessage(`تم حذف "${c.nameAr}"`); await onRefresh() }} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── ItemsTab ────────────────────────────────────────────────────────────────

export type ItemFormState = {
  categoryId: string
  nameAr: string
  price: string
  sizeOptions: SizeOptionForm[]
  attachments: AttachmentForm[]
  isWeighted: boolean
  weightedPriceOptions: WeightedPriceOptionForm[]
  allowCustomWeight: boolean
  customWeightUnitPrice: string
  lines: RecipeLineForm[]
}

export const defaultItemForm: ItemFormState = {
  categoryId: '',
  nameAr: '',
  price: '',
  sizeOptions: [],
  attachments: [],
  isWeighted: false,
  weightedPriceOptions: [{ id: 'default-weighted', label: '1 كجم', weightGrams: '1000', price: '' }],
  allowCustomWeight: false,
  customWeightUnitPrice: '',
  lines: [{ ingredientId: '', quantity: '', unit: 'جرام' }]
}

function ItemsTab({ categories, items, ingredients, onRefresh, setMessage, itemForm, setItemForm }: {
  categories: MenuCategory[]
  items: MenuItem[]
  ingredients: { id: string; nameAr: string; unit: string }[]
  onRefresh: () => Promise<void>
  setMessage: (m: string | null) => void
  itemForm: ItemFormState
  setItemForm: React.Dispatch<React.SetStateAction<ItemFormState>>
}): React.ReactElement {
  const [editingItem, setEditingItem] = useState<ItemEditState | null>(null)
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([])
  const [savingOrder, setSavingOrder] = useState(false)

  function validateWeightedPricing(options: WeightedPriceOption[], allowCustom: boolean, customPrice: string): boolean {
    if (options.length === 0) { setMessage('أضف سعر ميزان واحد على الأقل'); return false }
    if (allowCustom && Number(customPrice) <= 0) { setMessage('حدد سعر الكيلو للوزن المخصص'); return false }
    return true
  }

  async function addItem(e: FormEvent): Promise<void> {
    e.preventDefault()
    setMessage(null)
    if (!itemForm.categoryId) { setMessage('اختر التصنيف أولاً'); return }
    const lines: RecipeLine[] = itemForm.lines.filter((l) => l.ingredientId && l.quantity).map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), unit: l.unit }))
    const weightedOpts = normalizeWeightedOptions(itemForm.weightedPriceOptions)
    const sizeOpts = normalizeSizeOptions(itemForm.sizeOptions)
    const attachOpts = normalizeAttachments(itemForm.attachments)
    if (itemForm.isWeighted && !validateWeightedPricing(weightedOpts, itemForm.allowCustomWeight, itemForm.customWeightUnitPrice)) return
    try {
      await createMenuItemWithRecipe({
        categoryId: itemForm.categoryId,
        nameAr: itemForm.nameAr.trim(),
        price: itemForm.isWeighted
          ? (itemForm.allowCustomWeight && Number(itemForm.customWeightUnitPrice) > 0 ? Number(itemForm.customWeightUnitPrice) : (weightedOpts[0] ? weightedOpts[0].price / weightedOpts[0].weightKg : 0))
          : Number(itemForm.price),
        sizeOptions: itemForm.isWeighted ? [] : sizeOpts,
        attachments: attachOpts,
        isWeighted: itemForm.isWeighted,
        weightedPriceOptions: weightedOpts,
        allowCustomWeight: itemForm.isWeighted ? itemForm.allowCustomWeight : undefined,
        customWeightUnitPrice: itemForm.isWeighted && itemForm.allowCustomWeight ? Number(itemForm.customWeightUnitPrice) : undefined,
        lines,
        sortOrder: items.length
      })
      setItemForm((f) => ({ ...defaultItemForm, categoryId: f.categoryId, weightedPriceOptions: [newWeightedOption(true)] }))
      setMessage('تم حفظ الصنف')
      await onRefresh()
    } catch (err) { setMessage(err instanceof Error ? err.message : 'فشل') }
  }

  async function saveItemEdit(): Promise<void> {
    if (!editingItem) return
    const weightedOpts = normalizeWeightedOptions(editingItem.weightedPriceOptions)
    const sizeOpts = normalizeSizeOptions(editingItem.sizeOptions)
    const attachOpts = normalizeAttachments(editingItem.attachments)
    if (editingItem.isWeighted && !validateWeightedPricing(weightedOpts, editingItem.allowCustomWeight, editingItem.customWeightUnitPrice)) return
    await updateMenuItem(editingItem.id, {
      nameAr: editingItem.nameAr.trim(),
      price: editingItem.isWeighted ? (editingItem.allowCustomWeight && Number(editingItem.customWeightUnitPrice) > 0 ? Number(editingItem.customWeightUnitPrice) : (weightedOpts[0] ? weightedOpts[0].price / weightedOpts[0].weightKg : 0)) : Number(editingItem.price),
      categoryId: editingItem.categoryId,
      sizeOptions: editingItem.isWeighted ? [] : sizeOpts,
      attachments: attachOpts,
      isWeighted: editingItem.isWeighted,
      weightedPriceOptions: editingItem.isWeighted ? weightedOpts : [],
      allowCustomWeight: editingItem.isWeighted ? editingItem.allowCustomWeight : false,
      customWeightUnitPrice: editingItem.isWeighted && editingItem.allowCustomWeight ? Number(editingItem.customWeightUnitPrice) : undefined,
      active: editingItem.active
    })
    setEditingItem(null)
    setMessage('تم تعديل الصنف')
    await onRefresh()
  }

  async function moveMenuItem(idx: number, dir: -1 | 1): Promise<void> {
    const next = moveItem(items, idx, dir).map((it, i) => ({ ...it, sortOrder: i }))
    setSavingOrder(true)
    try { await reorderMenuItems(next.map((it) => ({ id: it.id, sortOrder: it.sortOrder }))) }
    finally { setSavingOrder(false); await onRefresh() }
  }

  async function openRecipe(item: MenuItem): Promise<void> {
    const recipe = await getRecipe(item.recipeId)
    if (recipe) { setEditingRecipeId(item.recipeId); setRecipeLines(recipe.lines) }
  }

  async function saveRecipe(): Promise<void> {
    if (!editingRecipeId) return
    await updateRecipe(editingRecipeId, recipeLines)
    setEditingRecipeId(null)
    setMessage('تم تعديل الوصفة')
  }

  function startEditItem(item: MenuItem): void {
    setEditingItem({ id: item.id, nameAr: item.nameAr, price: String(item.price), categoryId: item.categoryId,
      sizeOptions: (item.sizeOptions ?? []).map(toSizeOptionForm), attachments: (item.attachments ?? []).map(toAttachmentForm),
      isWeighted: !!item.isWeighted, weightedPriceOptions: (item.weightedPriceOptions ?? []).map(toWeightedOptionForm),
      allowCustomWeight: !!item.allowCustomWeight, customWeightUnitPrice: item.customWeightUnitPrice != null ? String(item.customWeightUnitPrice) : '', active: item.active })
  }

  return (
    <div className="tab-content">
      {savingOrder && <p className="form-message" role="status">جارٍ حفظ الترتيب...</p>}

      {/* Add item form */}
      <div className="card">
        <h2 className="card__title">إضافة صنف + وصفة</h2>
        <form onSubmit={(e) => void addItem(e)}>
          <div className="settings-form-grid">
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
            {!itemForm.isWeighted && (
              <label className="field">
                <span>السعر</span>
                <input type="number" min="0" step="0.01" value={itemForm.price} onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))} required />
              </label>
            )}
            <label className="field field--checkbox settings-form-grid__full">
              <input type="checkbox" checked={itemForm.isWeighted} onChange={(e) => setItemForm((f) => ({ ...f, isWeighted: e.target.checked, weightedPriceOptions: e.target.checked && f.weightedPriceOptions.length === 0 ? [newWeightedOption(true)] : f.weightedPriceOptions }))} />
              <span>منتج ميزان (الوصفة لكل 1 كجم)</span>
            </label>
          </div>

          {/* Size options */}
          {!itemForm.isWeighted && (
            <div className="weighted-pricing-editor">
              <h3>أحجام</h3>
              {itemForm.sizeOptions.map((o, idx) => (
                <div key={o.id} className="weighted-pricing-row">
                  <input value={o.labelAr} onChange={(e) => setItemForm((f) => { const s=[...f.sizeOptions]; s[idx]={...s[idx]!,labelAr:e.target.value}; return {...f,sizeOptions:s} })} placeholder="حجم مثل صغير" />
                  <input type="number" min="0" step="0.01" value={o.price} onChange={(e) => setItemForm((f) => { const s=[...f.sizeOptions]; s[idx]={...s[idx]!,price:e.target.value}; return {...f,sizeOptions:s} })} placeholder="السعر" />
                  <button type="button" className="btn btn--danger btn--sm" onClick={() => setItemForm((f) => ({ ...f, sizeOptions: f.sizeOptions.filter((_,i)=>i!==idx) }))}><MdClose /></button>
                </div>
              ))}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setItemForm((f) => ({ ...f, sizeOptions: [...f.sizeOptions, newSizeOption()] }))}>+ حجم</button>
            </div>
          )}

          {/* Weighted pricing */}
          {itemForm.isWeighted && (
            <div className="weighted-pricing-editor">
              <h3>أسعار الميزان</h3>
              {itemForm.weightedPriceOptions.map((o, idx) => (
                <div key={o.id} className="weighted-pricing-row">
                  <input value={o.label} onChange={(e) => setItemForm((f) => { const w=[...f.weightedPriceOptions]; w[idx]={...w[idx]!,label:e.target.value}; return {...f,weightedPriceOptions:w} })} placeholder="اسم الزر" />
                  <input type="number" min="1" step="1" value={o.weightGrams} onChange={(e) => setItemForm((f) => { const w=[...f.weightedPriceOptions]; w[idx]={...w[idx]!,weightGrams:e.target.value}; return {...f,weightedPriceOptions:w} })} placeholder="جرام" />
                  <input type="number" min="0" step="0.01" value={o.price} onChange={(e) => setItemForm((f) => { const w=[...f.weightedPriceOptions]; w[idx]={...w[idx]!,price:e.target.value}; return {...f,weightedPriceOptions:w} })} placeholder="السعر" />
                  <button type="button" className="btn btn--danger btn--sm" onClick={() => setItemForm((f) => ({ ...f, weightedPriceOptions: f.weightedPriceOptions.filter((_,i)=>i!==idx) }))}><MdClose /></button>
                </div>
              ))}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setItemForm((f) => ({ ...f, weightedPriceOptions: [...f.weightedPriceOptions, newWeightedOption()] }))}>+ سعر ميزان</button>
              <label className="field field--checkbox" style={{ marginTop: 8 }}>
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

          {/* Attachments */}
          <div className="weighted-pricing-editor">
            <h3>مرفقات تلقائية</h3>
            {itemForm.attachments.map((o, idx) => (
              <div key={o.id} className="weighted-pricing-row">
                <input value={o.nameAr} onChange={(e) => setItemForm((f) => { const a=[...f.attachments]; a[idx]={...a[idx]!,nameAr:e.target.value}; return {...f,attachments:a} })} placeholder="اسم المرفق" />
                <input type="number" min="0" step="0.01" value={o.price} onChange={(e) => setItemForm((f) => { const a=[...f.attachments]; a[idx]={...a[idx]!,price:e.target.value}; return {...f,attachments:a} })} placeholder="السعر" />
                <button type="button" className="btn btn--danger btn--sm" onClick={() => setItemForm((f) => ({ ...f, attachments: f.attachments.filter((_,i)=>i!==idx) }))}><MdClose /></button>
              </div>
            ))}
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setItemForm((f) => ({ ...f, attachments: [...f.attachments, newAttachment()] }))}>+ مرفق</button>
          </div>

          {/* Recipe lines */}
          <h3 style={{ margin: '12px 0 8px', fontWeight: 700 }}>مكوّنات الوصفة <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)', fontWeight: 400 }}>(اختياري — اتركه فارغاً إذا لم تريد خصم مخزون)</span></h3>
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
              <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => { const lines=[...itemForm.lines]; lines[idx]={...lines[idx]!,quantity:e.target.value}; setItemForm((f)=>({...f,lines})) }} style={{ width: 80 }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>{line.unit}</span>
              {itemForm.lines.length > 1 && <button type="button" className="btn btn--danger btn--sm" onClick={() => setItemForm((f) => ({ ...f, lines: f.lines.filter((_,i)=>i!==idx) }))}><MdClose /></button>}
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setItemForm((f) => ({ ...f, lines: [...f.lines, { ingredientId: '', quantity: '', unit: 'جرام' }] }))}>+ سطر وصفة</button>
            <button type="submit" className="btn btn--primary">حفظ الصنف</button>
          </div>
        </form>
      </div>

      {/* Items table */}
      <div className="card">
        <h2 className="card__title">أصناف القائمة ({items.length})</h2>
        <table className="data-table">
          <thead>
            <tr><th>ترتيب</th><th>الصنف</th><th>السعر</th><th>التصنيف</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const isEditing = editingItem?.id === item.id
              return (
                <tr key={item.id}>
                  <td>
                    <div className="sort-arrows">
                      <button type="button" className="sort-arrow-btn" disabled={idx === 0} onClick={() => void moveMenuItem(idx, -1)}><MdArrowUpward /></button>
                      <button type="button" className="sort-arrow-btn" disabled={idx === items.length - 1} onClick={() => void moveMenuItem(idx, 1)}><MdArrowDownward /></button>
                    </div>
                  </td>
                  <td>{isEditing ? <input className="inline-edit-input" value={editingItem.nameAr} onChange={(e) => setEditingItem({...editingItem,nameAr:e.target.value})} autoFocus /> : item.nameAr}</td>
                  <td>{isEditing ? (editingItem.isWeighted ? <span style={{color:'var(--color-muted)',fontSize:'0.82rem'}}>من أسعار الميزان</span> : <input className="inline-edit-input" type="number" step="0.01" value={editingItem.price} onChange={(e) => setEditingItem({...editingItem,price:e.target.value})} style={{width:80}} />) : (item.isWeighted ? 'ميزان' : item.price.toFixed(2))}</td>
                  <td>
                    {isEditing ? <select className="inline-edit-input" value={editingItem.categoryId} onChange={(e) => setEditingItem({...editingItem,categoryId:e.target.value})}>{categories.map((c)=><option key={c.id} value={c.id}>{c.nameAr}</option>)}</select>
                    : categories.find((c) => c.id === item.categoryId)?.nameAr ?? '-'}
                  </td>
                  <td>
                    {isEditing ? <select className="inline-edit-input" value={editingItem.active?'active':'inactive'} onChange={(e)=>setEditingItem({...editingItem,active:e.target.value==='active'})}><option value="active">مفعّل</option><option value="inactive">معطّل</option></select>
                    : <span style={{color:item.active?'var(--color-success)':'var(--color-muted)',fontWeight:700,fontSize:'0.82rem'}}>{item.active?'مفعّل':'معطّل'}</span>}
                  </td>
                  <td>
                    <div className="table-actions">
                      {isEditing ? (<><button type="button" className="btn btn--primary btn--sm" onClick={()=>void saveItemEdit()}><MdCheck/> حفظ</button><button type="button" className="btn btn--secondary btn--sm" onClick={()=>setEditingItem(null)}><MdClose/></button></>) :
                      (<><button type="button" className="btn btn--secondary btn--sm" onClick={()=>startEditItem(item)}><MdEdit/> تعديل</button><button type="button" className="btn btn--secondary btn--sm" onClick={()=>void openRecipe(item)}>الوصفة</button><ConfirmDeleteButton confirmMessage={`حذف "${item.nameAr}"؟`} onConfirm={async()=>{await deleteMenuItem(item.id,item.recipeId);await onRefresh()}}/></>)}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Recipe modal */}
      {editingRecipeId && (
        <div className="modal-overlay" onClick={() => setEditingRecipeId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px' }}>تعديل الوصفة</h2>
            {recipeLines.map((line, idx) => (
              <div key={idx} className="page-toolbar" style={{ gap: 6, marginBottom: 8 }}>
                <select value={line.ingredientId} onChange={(e) => { const next=[...recipeLines]; const ing=ingredients.find((i)=>i.id===e.target.value); next[idx]={...next[idx]!,ingredientId:e.target.value,unit:ing?.unit??line.unit}; setRecipeLines(next) }}>{ingredients.map((i)=><option key={i.id} value={i.id}>{i.nameAr}</option>)}</select>
                <input type="number" value={line.quantity} style={{ width: 80 }} onChange={(e) => { const next=[...recipeLines]; next[idx]={...next[idx]!,quantity:Number(e.target.value)}; setRecipeLines(next) }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>{line.unit}</span>
                <button type="button" className="btn btn--danger btn--sm" onClick={() => setRecipeLines((l)=>l.filter((_,i)=>i!==idx))}><MdClose /></button>
              </div>
            ))}
            <div className="form-actions">
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setRecipeLines((l)=>[...l,{ingredientId:ingredients[0]?.id??'',quantity:1,unit:ingredients[0]?.unit??'جرام'}])}>+ مكوّن</button>
              <button type="button" className="btn btn--primary" onClick={() => void saveRecipe()}>حفظ الوصفة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────

type ItemsTab = 'categories' | 'items'

export function ItemsPage(): React.ReactElement {
  const { saved, save } = usePageState<{
    activeTab: ItemsTab
    itemForm: ItemFormState
  }>('/manager/items')

  const [activeTab, setActiveTab] = useState<ItemsTab>(saved.activeTab ?? 'items')
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [ingredients, setIngredients] = useState<{ id: string; nameAr: string; unit: string }[]>([])
  const [message, setMessage] = useState<string | null>(null)

  // Restore persisted itemForm or use defaults
  const [itemForm, setItemForm] = useState<ItemFormState>(() => {
    const s = saved.itemForm
    if (s) return s as ItemFormState
    return { ...defaultItemForm, weightedPriceOptions: [newWeightedOption(true)] }
  })

  // Persist active tab + itemForm whenever they change
  useEffect(() => { save({ activeTab }) }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { save({ itemForm }) }, [itemForm]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    const [cats, menu, ing] = await Promise.all([listCategories(), listMenuItems(), listIngredients()])
    setCategories(cats)
    setItems(menu)
    setIngredients(ing.map((i) => ({ id: i.id, nameAr: i.nameAr, unit: i.unit })))
  }, [])

  useEffect(() => { void load() }, [load])

  // Auto-clear message
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [message])

  const tabs: { key: ItemsTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'items',      label: 'الأصناف',    icon: <MdMenuBook />,  count: items.length },
    { key: 'categories', label: 'التصنيفات',  icon: <MdCategory />,  count: categories.length },
  ]

  return (
    <div className="unified-page">
      {/* Internal tab strip */}
      <div className="inner-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={`inner-tab${activeTab === t.key ? ' inner-tab--active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && <span className="inner-tab__count">{t.count}</span>}
          </button>
        ))}
      </div>

      {message && (
        <p className={`form-message ${message.includes('فشل')||message.includes('لا يمكن') ? 'form-message--error' : 'form-message--ok'}`} role="status">{message}</p>
      )}

      {activeTab === 'categories' && <CategoriesTab categories={categories} onRefresh={load} setMessage={setMessage} />}
      {activeTab === 'items'      && <ItemsTab categories={categories} items={items} ingredients={ingredients} onRefresh={load} setMessage={setMessage} itemForm={itemForm} setItemForm={setItemForm} />}
    </div>
  )
}
