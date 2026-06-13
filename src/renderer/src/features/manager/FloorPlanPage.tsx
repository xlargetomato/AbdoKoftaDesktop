/**
 * FloorPlanPage — visual drag-and-drop table layout editor.
 *
 * Design principles (performance on low-end hardware):
 *  - All drag operations update a ref, NOT state → zero React re-renders during drag
 *  - Only pointer-up commits position changes to state + SQLite
 *  - Tables rendered as CSS-transformed divs (GPU-composited layer per table)
 *  - Grid-snap at 20px keeps layout clean without extra computation
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { DiningTable, Floor, TableShape } from '@shared/types'
import {
  listFloors, saveFloor, deleteFloor,
  listDiningTables, saveDiningTable, saveTablesBatch, deleteDiningTable
} from '@renderer/features/tables/table-service'
import { ConfirmDeleteButton } from '@renderer/components/ConfirmDeleteButton'
import {
  MdAdd, MdSave, MdDelete, MdEdit, MdCheck, MdClose,
  MdTableRestaurant, MdGridOn, MdGridOff, MdZoomIn, MdZoomOut,
  MdRotateRight, MdAddCircle
} from 'react-icons/md'

// ── Constants ─────────────────────────────────────────────────────────────

const GRID = 20           // snap grid in logical px
const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.0
const DEFAULT_W = 80
const DEFAULT_H = 80

// ── Helpers ───────────────────────────────────────────────────────────────

function snap(v: number): number {
  return Math.round(v / GRID) * GRID
}

const SHAPE_LABELS: Record<TableShape, string> = {
  rect: 'مستطيل',
  circle: 'دائري',
  round_rect: 'مدوّر'
}

// ── TableNode — a single draggable table on the canvas ────────────────────

interface TableNodeProps {
  table: DiningTable
  isSelected: boolean
  isOccupied?: boolean
  showSeats: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>, id: string) => void
  onClick: (id: string) => void
}

function seatPositions(w: number, h: number, seats: number, shape: TableShape): Array<{ x: number; y: number }> {
  // Distribute seats evenly around the perimeter
  const positions: Array<{ x: number; y: number }> = []
  const seatR = 10
  const isCircle = shape === 'circle'
  const r = isCircle ? w / 2 : undefined

  if (isCircle && r) {
    for (let i = 0; i < seats; i++) {
      const angle = (2 * Math.PI * i) / seats - Math.PI / 2
      const rx = r + seatR + 2
      positions.push({ x: w / 2 + rx * Math.cos(angle), y: h / 2 + rx * Math.sin(angle) })
    }
  } else {
    // Place seats on the four sides proportionally
    const perSide = Math.max(1, Math.round(seats / 4))
    const sides: Array<{ axis: 'x' | 'y'; fixed: number; from: number; to: number }> = [
      { axis: 'x', fixed: -seatR * 2 - 2, from: 10, to: w - 10 },   // top
      { axis: 'x', fixed: h + 2,           from: 10, to: w - 10 },   // bottom
      { axis: 'y', fixed: -seatR * 2 - 2, from: 10, to: h - 10 },   // left
      { axis: 'y', fixed: w + 2,           from: 10, to: h - 10 },   // right
    ]
    let placed = 0
    for (const side of sides) {
      const count = Math.min(perSide, seats - placed)
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1)
        const along = side.from + t * (side.to - side.from)
        if (side.axis === 'x') positions.push({ x: along, y: side.fixed })
        else                   positions.push({ x: side.fixed, y: along })
        placed++
      }
      if (placed >= seats) break
    }
  }
  return positions
}

function TableNode({ table, isSelected, showSeats, onPointerDown, onClick }: TableNodeProps): React.ReactElement {
  const x = table.x ?? 0
  const y = table.y ?? 0
  const w = table.w ?? DEFAULT_W
  const h = table.h ?? DEFAULT_H
  const shape = table.shape ?? 'rect'
  const seats = table.seats ?? 4
  const rotation = table.rotation ?? 0
  const seatPts = showSeats ? seatPositions(w, h, seats, shape) : []
  const seatR = 9

  const borderRadius =
    shape === 'circle'     ? '50%' :
    shape === 'round_rect' ? '16px' :
    '4px'

  const padding = showSeats ? seatR * 2 + 6 : 0

  return (
    <div
      className={`fp-table${isSelected ? ' fp-table--selected' : ''}`}
      style={{
        position: 'absolute',
        left: x - padding,
        top:  y - padding,
        width:  w + padding * 2,
        height: h + padding * 2,
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
        zIndex: isSelected ? 10 : 1,
      }}
      onPointerDown={(e) => onPointerDown(e, table.id)}
      onClick={() => onClick(table.id)}
    >
      {/* Seats */}
      {seatPts.map((pt, i) => (
        <div
          key={i}
          className="fp-seat"
          style={{
            position: 'absolute',
            left: pt.x + padding - seatR,
            top:  pt.y + padding - seatR,
            width:  seatR * 2,
            height: seatR * 2,
            borderRadius: '50%',
            pointerEvents: 'none'
          }}
        />
      ))}
      {/* Table body */}
      <div
        className="fp-table__body"
        style={{
          position: 'absolute',
          left: padding,
          top:  padding,
          width: w,
          height: h,
          borderRadius,
          transform: `rotate(${rotation}deg)`,
          pointerEvents: 'none'
        }}
      >
        <span className="fp-table__label">{table.nameAr}</span>
      </div>
    </div>
  )
}

// ── AddTableModal ─────────────────────────────────────────────────────────

interface AddTableModalProps {
  floorId: string
  onSave: (t: DiningTable) => void
  onClose: () => void
  dropX?: number
  dropY?: number
}

function AddTableModal({ floorId, onSave, onClose, dropX, dropY }: AddTableModalProps): React.ReactElement {
  const [nameAr, setNameAr] = useState('')
  const [shape, setShape] = useState<TableShape>('rect')
  const [seats, setSeats] = useState(4)
  const [w, setW] = useState(DEFAULT_W)
  const [h, setH] = useState(DEFAULT_H)
  const [saving, setSaving] = useState(false)

  async function handleSave(): Promise<void> {
    if (!nameAr.trim()) return
    setSaving(true)
    const t = await saveDiningTable({
      nameAr: nameAr.trim(),
      floorId,
      x: snap(dropX ?? 100),
      y: snap(dropY ?? 100),
      w, h, shape, seats,
      active: true,
      sortOrder: Date.now()
    })
    onSave(t)
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="order-details__header">
          <h2 className="order-details__title">إضافة ترابيزة</h2>
          <button type="button" className="order-details__close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-form-grid" style={{ marginBottom: 12 }}>
          <label className="field settings-form-grid__full">
            <span>اسم الترابيزة</span>
            <input autoFocus value={nameAr} onChange={(e) => setNameAr(e.target.value)}
              placeholder="مثال: 1 أو VIP"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }} />
          </label>
          <label className="field">
            <span>الشكل</span>
            <select value={shape} onChange={(e) => setShape(e.target.value as TableShape)}>
              {(Object.entries(SHAPE_LABELS) as [TableShape, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>عدد الكراسي</span>
            <input type="number" min={0} max={20} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>العرض (px)</span>
            <input type="number" min={40} max={300} step={20} value={w} onChange={(e) => setW(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>الارتفاع (px)</span>
            <input type="number" min={40} max={300} step={20} value={h} onChange={(e) => setH(Number(e.target.value))} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn--primary" disabled={saving || !nameAr.trim()} onClick={() => void handleSave()}>
            <MdAdd /> إضافة
          </button>
          <button type="button" className="btn btn--secondary" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}

// ── EditTableModal ────────────────────────────────────────────────────────

interface EditTableModalProps {
  table: DiningTable
  onSave: (t: DiningTable) => void
  onClose: () => void
}

function EditTableModal({ table, onSave, onClose }: EditTableModalProps): React.ReactElement {
  const [nameAr, setNameAr] = useState(table.nameAr)
  const [shape, setShape] = useState<TableShape>(table.shape ?? 'rect')
  const [seats, setSeats] = useState(table.seats ?? 4)
  const [w, setW] = useState(table.w ?? DEFAULT_W)
  const [h, setH] = useState(table.h ?? DEFAULT_H)
  const [rotation, setRotation] = useState(table.rotation ?? 0)
  const [saving, setSaving] = useState(false)

  async function handleSave(): Promise<void> {
    if (!nameAr.trim()) return
    setSaving(true)
    const updated = await saveDiningTable({ ...table, nameAr, shape, seats, w, h, rotation })
    onSave(updated)
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="order-details__header">
          <h2 className="order-details__title">تعديل الترابيزة</h2>
          <button type="button" className="order-details__close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-form-grid" style={{ marginBottom: 12 }}>
          <label className="field settings-form-grid__full">
            <span>الاسم</span>
            <input autoFocus value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </label>
          <label className="field">
            <span>الشكل</span>
            <select value={shape} onChange={(e) => setShape(e.target.value as TableShape)}>
              {(Object.entries(SHAPE_LABELS) as [TableShape, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>الكراسي</span>
            <input type="number" min={0} max={20} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>العرض (px)</span>
            <input type="number" min={40} max={300} step={20} value={w} onChange={(e) => setW(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>الارتفاع (px)</span>
            <input type="number" min={40} max={300} step={20} value={h} onChange={(e) => setH(Number(e.target.value))} />
          </label>
          <label className="field settings-form-grid__full">
            <span>الدوران: {rotation}°</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0, 45, 90, 135, 180, 270].map((deg) => (
                <button
                  key={deg} type="button"
                  className={`btn btn--sm ${rotation === deg ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ minHeight: 30, padding: '0 8px', fontSize: '0.78rem' }}
                  onClick={() => setRotation(deg)}
                >{deg}°</button>
              ))}
            </div>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn--primary" disabled={saving || !nameAr.trim()} onClick={() => void handleSave()}>
            <MdCheck /> حفظ
          </button>
          <button type="button" className="btn btn--secondary" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}

// ── FloorPlanPage ─────────────────────────────────────────────────────────

export function FloorPlanPage(): React.ReactElement {
  const [floors, setFloors] = useState<Floor[]>([])
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null)
  const [tables, setTables] = useState<DiningTable[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [showSeats, setShowSeats] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [showAddTable, setShowAddTable] = useState(false)
  const [dropPos, setDropPos] = useState<{ x: number; y: number } | null>(null)
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  // Floor form
  const [floorFormOpen, setFloorFormOpen] = useState(false)
  const [floorName, setFloorName] = useState('')
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null)

  // ── Drag state — all in refs, never in React state ─────────────────────
  const draggingId  = useRef<string | null>(null)
  const dragOffset  = useRef({ x: 0, y: 0 })
  const dragNodeRef = useRef<HTMLDivElement | null>(null)
  const canvasRef   = useRef<HTMLDivElement>(null)

  // ── Load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const fl = await listFloors(true)
    setFloors(fl)
    if (fl.length > 0) {
      const first = fl[0]!
      setActiveFloorId((prev) => prev ?? first.id)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!activeFloorId) return
    void listDiningTables(true).then((all) => {
      setTables(all.filter((t) => t.floorId === activeFloorId))
    })
  }, [activeFloorId])

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null

  // ── Flash message ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  // ── Drag handlers ──────────────────────────────────────────────────────

  function handleTablePointerDown(e: ReactPointerEvent<HTMLDivElement>, id: string): void {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    const table = tables.find((t) => t.id === id)
    if (!table) return

    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (!canvasRect) return

    // Offset from top-left of the table body relative to canvas (accounting for zoom)
    const tableX = (table.x ?? 0)
    const tableY = (table.y ?? 0)
    const seats = showSeats ? (table.seats ?? 4) : 0
    const pad = seats > 0 ? 9 * 2 + 6 : 0

    // Click position in canvas logical coords
    const cx = (e.clientX - canvasRect.left) / zoom
    const cy = (e.clientY - canvasRect.top)  / zoom

    dragOffset.current = {
      x: cx - (tableX - pad),
      y: cy - (tableY - pad)
    }
    draggingId.current = id
    setSelectedId(id)

    // Find the DOM node we're dragging so we can move it directly
    dragNodeRef.current = e.currentTarget
    dragNodeRef.current.style.zIndex = '100'
    dragNodeRef.current.style.cursor = 'grabbing'
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!draggingId.current || !dragNodeRef.current || !canvasRef.current) return
    e.preventDefault()

    const canvasRect = canvasRef.current.getBoundingClientRect()
    const cx = (e.clientX - canvasRect.left) / zoom
    const cy = (e.clientY - canvasRect.top)  / zoom

    const table = tables.find((t) => t.id === draggingId.current)
    if (!table) return

    const seats = showSeats ? (table.seats ?? 4) : 0
    const pad = seats > 0 ? 9 * 2 + 6 : 0

    const rawLeft = cx - dragOffset.current.x
    const rawTop  = cy - dragOffset.current.y

    // Clamp to canvas bounds
    const maxX = (activeFloor?.width  ?? 1200) - (table.w ?? DEFAULT_W) - pad
    const maxY = (activeFloor?.height ?? 800)  - (table.h ?? DEFAULT_H) - pad
    const snappedLeft = Math.max(-pad, Math.min(snap(rawLeft), maxX))
    const snappedTop  = Math.max(-pad, Math.min(snap(rawTop),  maxY))

    // Directly mutate the DOM — no React state update during drag
    dragNodeRef.current.style.left = `${snappedLeft}px`
    dragNodeRef.current.style.top  = `${snappedTop}px`
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!draggingId.current || !dragNodeRef.current || !canvasRef.current) return

    const canvasRect = canvasRef.current.getBoundingClientRect()
    const cx = (e.clientX - canvasRect.left) / zoom
    const cy = (e.clientY - canvasRect.top)  / zoom

    const table = tables.find((t) => t.id === draggingId.current)
    if (table) {
      const seats = showSeats ? (table.seats ?? 4) : 0
      const pad = seats > 0 ? 9 * 2 + 6 : 0

      const rawLeft = cx - dragOffset.current.x
      const rawTop  = cy - dragOffset.current.y
      const maxX = (activeFloor?.width  ?? 1200) - (table.w ?? DEFAULT_W) - pad
      const maxY = (activeFloor?.height ?? 800)  - (table.h ?? DEFAULT_H) - pad
      const newX = Math.max(0, Math.min(snap(rawLeft + pad), maxX + pad))
      const newY = Math.max(0, Math.min(snap(rawTop  + pad), maxY + pad))

      // NOW update React state (only once, on release)
      setTables((prev) =>
        prev.map((t) => t.id === table.id ? { ...t, x: newX, y: newY } : t)
      )
    }

    dragNodeRef.current.style.zIndex = ''
    dragNodeRef.current.style.cursor = 'grab'
    draggingId.current = null
    dragNodeRef.current = null
  }

  // ── Canvas double-click to add table ───────────────────────────────────
  function handleCanvasDblClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (!activeFloorId) return
    if ((e.target as HTMLElement).closest('.fp-table')) return // clicked on a table

    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (!canvasRect) return
    const x = snap((e.clientX - canvasRect.left) / zoom)
    const y = snap((e.clientY - canvasRect.top)  / zoom)
    setDropPos({ x, y })
    setShowAddTable(true)
  }

  // ── Save all positions ─────────────────────────────────────────────────
  async function handleSaveAll(): Promise<void> {
    setSavingAll(true)
    try {
      await saveTablesBatch(tables)
      setMsg('تم حفظ مواضع الترابيزات ✓')
    } catch { setMsg('فشل الحفظ') }
    finally { setSavingAll(false) }
  }

  // ── Floor management ───────────────────────────────────────────────────
  async function handleSaveFloor(): Promise<void> {
    if (!floorName.trim()) return
    const floor = await saveFloor(
      editingFloor
        ? { ...editingFloor, nameAr: floorName }
        : { nameAr: floorName }
    )
    setFloorFormOpen(false)
    setFloorName('')
    setEditingFloor(null)
    await load()
    setActiveFloorId(floor.id)
    setMsg(editingFloor ? 'تم تعديل المنطقة' : 'تمت إضافة المنطقة')
  }

  async function handleDeleteFloor(floorId: string): Promise<void> {
    await deleteFloor(floorId)
    await load()
    setActiveFloorId((prev) => prev === floorId ? null : prev)
    setMsg('تم حذف المنطقة')
  }

  // ── Delete selected table ──────────────────────────────────────────────
  async function handleDeleteSelected(): Promise<void> {
    if (!selectedId) return
    await deleteDiningTable(selectedId)
    setTables((prev) => prev.filter((t) => t.id !== selectedId))
    setSelectedId(null)
    setMsg('تم حذف الترابيزة')
  }

  // ── Rotate selected ───────────────────────────────────────────────────
  async function handleRotateSelected(): Promise<void> {
    if (!selectedId) return
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== selectedId) return t
        const newRot = ((t.rotation ?? 0) + 90) % 360
        void saveDiningTable({ ...t, rotation: newRot })
        return { ...t, rotation: newRot }
      })
    )
  }

  const selectedTable = tables.find((t) => t.id === selectedId) ?? null

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="fp-page">
      {/* ── Top toolbar ── */}
      <div className="fp-toolbar">
        <div className="fp-toolbar__left">
          {/* Floor tabs */}
          {floors.map((floor) => (
            <button
              key={floor.id}
              type="button"
              className={`fp-floor-tab${activeFloorId === floor.id ? ' fp-floor-tab--active' : ''}`}
              onClick={() => { setActiveFloorId(floor.id); setSelectedId(null) }}
            >
              {floor.nameAr}
            </button>
          ))}
          <button
            type="button"
            className="fp-floor-tab fp-floor-tab--add"
            onClick={() => { setFloorFormOpen(true); setEditingFloor(null); setFloorName('') }}
            title="إضافة منطقة جديدة"
          >
            <MdAdd />
          </button>
        </div>

        <div className="fp-toolbar__right">
          {/* Toggle buttons */}
          <button type="button" className={`btn btn--sm ${showGrid ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setShowGrid((v) => !v)} title="شبكة">
            {showGrid ? <MdGridOn /> : <MdGridOff />}
          </button>
          <button type="button" className={`btn btn--sm ${showSeats ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setShowSeats((v) => !v)} title="عرض الكراسي">
            <MdTableRestaurant />
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(1)))} title="تصغير"><MdZoomOut /></button>
          <span className="fp-zoom-label">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(1)))} title="تكبير"><MdZoomIn /></button>

          {/* Selected table actions */}
          {selectedTable && (
            <>
              <div className="fp-toolbar__divider" />
              <span className="fp-toolbar__selected-label">
                {selectedTable.nameAr}
              </span>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditingTable(selectedTable)} title="تعديل">
                <MdEdit />
              </button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleRotateSelected()} title="تدوير 90°">
                <MdRotateRight />
              </button>
              <ConfirmDeleteButton
                confirmMessage={`حذف ترابيزة "${selectedTable.nameAr}"؟`}
                onConfirm={handleDeleteSelected}
              />
            </>
          )}

          <div className="fp-toolbar__divider" />

          {/* Add table button */}
          {activeFloorId && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => { setDropPos(null); setShowAddTable(true) }}
              title="إضافة ترابيزة"
            >
              <MdAddCircle /> ترابيزة
            </button>
          )}

          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void handleSaveAll()}
            disabled={savingAll || !activeFloorId}
            title="حفظ المواضع"
          >
            <MdSave /> {savingAll ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      </div>

      {/* ── Message bar ── */}
      {msg && (
        <div className={`fp-msg ${msg.includes('فشل') ? 'fp-msg--error' : 'fp-msg--ok'}`}>
          {msg}
        </div>
      )}

      {/* ── No floor state ── */}
      {floors.length === 0 && (
        <div className="fp-empty">
          <MdTableRestaurant className="fp-empty__icon" />
          <p>لا توجد مناطق بعد</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => { setFloorFormOpen(true); setEditingFloor(null); setFloorName('') }}
          >
            <MdAdd /> إضافة منطقة
          </button>
        </div>
      )}

      {/* ── Sidebar + Canvas ── */}
      {activeFloor && (
        <div className="fp-workspace">
          {/* Sidebar — floor properties */}
          <aside className="fp-sidebar">
            <div className="fp-sidebar__section">
              <h3>المنطقة الحالية</h3>
              <p className="fp-sidebar__name">{activeFloor.nameAr}</p>
              <p className="fp-sidebar__meta">
                {tables.length} ترابيزة — {activeFloor.width}×{activeFloor.height}
              </p>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => { setEditingFloor(activeFloor); setFloorName(activeFloor.nameAr); setFloorFormOpen(true) }}
              >
                <MdEdit /> تعديل المنطقة
              </button>
              <ConfirmDeleteButton
                confirmMessage={`حذف منطقة "${activeFloor.nameAr}" وكل ترابيزاتها؟`}
                onConfirm={() => handleDeleteFloor(activeFloor.id)}
              />
            </div>

            <div className="fp-sidebar__section">
              <h3>قائمة الترابيزات</h3>
              {tables.length === 0 && <p className="fp-sidebar__empty">انقر نقراً مزدوجاً على اللوحة لإضافة ترابيزة</p>}
              {tables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`fp-table-list-item${selectedId === t.id ? ' fp-table-list-item--active' : ''}`}
                  onClick={() => setSelectedId(t.id)}
                >
                  <span>{t.nameAr}</span>
                  <span className="fp-table-list-item__meta">{t.seats ?? 4} 🪑</span>
                </button>
              ))}
            </div>

            <div className="fp-sidebar__section fp-sidebar__hint">
              <p>💡 نقر مزدوج على اللوحة لإضافة ترابيزة في موضع محدد</p>
              <p>💡 اسحب الترابيزة لتغيير موضعها</p>
              <p>💡 اضغط حفظ لتثبيت المواضع</p>
            </div>
          </aside>

          {/* Canvas scroll wrapper */}
          <div className="fp-canvas-wrapper">
            <div
              className="fp-canvas-scroll"
              style={{ cursor: 'default' }}
            >
              <div
                ref={canvasRef}
                className={`fp-canvas${showGrid ? ' fp-canvas--grid' : ''}`}
                style={{
                  width:  activeFloor.width,
                  height: activeFloor.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  background: activeFloor.bgColor ?? undefined,
                  position: 'relative',
                  flexShrink: 0
                }}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerLeave={handleCanvasPointerUp}
                onDoubleClick={handleCanvasDblClick}
              >
                {tables.map((t) => (
                  <TableNode
                    key={t.id}
                    table={t}
                    isSelected={selectedId === t.id}
                    showSeats={showSeats}
                    onPointerDown={handleTablePointerDown}
                    onClick={(id) => setSelectedId((prev) => prev === id ? null : id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Floor form modal ── */}
      {floorFormOpen && (
        <div className="modal-overlay" onClick={() => setFloorFormOpen(false)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="order-details__header">
              <h2 className="order-details__title">
                {editingFloor ? 'تعديل المنطقة' : 'إضافة منطقة'}
              </h2>
              <button type="button" className="order-details__close" onClick={() => setFloorFormOpen(false)}>✕</button>
            </div>
            <label className="field">
              <span>اسم المنطقة</span>
              <input
                autoFocus
                value={floorName}
                onChange={(e) => setFloorName(e.target.value)}
                placeholder="مثال: الصالة / الحديقة / الطابق الثاني"
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveFloor() }}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn--primary" disabled={!floorName.trim()} onClick={() => void handleSaveFloor()}>
                <MdCheck /> {editingFloor ? 'تعديل' : 'إضافة'}
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => setFloorFormOpen(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add table modal ── */}
      {showAddTable && activeFloorId && (
        <AddTableModal
          floorId={activeFloorId}
          dropX={dropPos?.x}
          dropY={dropPos?.y}
          onSave={(t) => {
            setTables((prev) => [...prev, t])
            setSelectedId(t.id)
            setShowAddTable(false)
            setDropPos(null)
            setMsg(`تمت إضافة ترابيزة "${t.nameAr}"`)
          }}
          onClose={() => { setShowAddTable(false); setDropPos(null) }}
        />
      )}

      {/* ── Edit table modal ── */}
      {editingTable && (
        <EditTableModal
          table={editingTable}
          onSave={(updated) => {
            setTables((prev) => prev.map((t) => t.id === updated.id ? updated : t))
            setEditingTable(null)
            setMsg(`تم تعديل ترابيزة "${updated.nameAr}"`)
          }}
          onClose={() => setEditingTable(null)}
        />
      )}
    </div>
  )
}
