/**
 * FloorMapPicker — read-only POS table picker that renders the visual floor plan.
 *
 * Shows the exact same layout drawn in the manager floor-plan editor:
 *  - Tables in their real positions with correct shapes
 *  - Chairs drawn around each table
 *  - Walls/lines as SVG
 *  - Green  = available
 *  - Red    = occupied (unpaid order)
 *  - Blue   = currently selected
 *
 * Clicking a table calls onSelect(tableId).
 * Falls back to a simple list grid when no floors/positions exist.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiningTable, Floor, WallSegment } from '@shared/types'
import { listFloors } from '@renderer/features/tables/table-service'

// ── Constants (must match FloorPlanPage) ──────────────────────────────────

const CHAIR_R   = 11
const CHAIR_GAP = 5
const DEFAULT_W = 80
const DEFAULT_H = 80

// ── Chair positions (same algorithm as FloorPlanPage) ─────────────────────

function chairPositionsForTable(t: DiningTable): Array<{ x: number; y: number }> {
  if (t.chairPositions && t.chairPositions.length > 0) {
    return t.chairPositions.map((cp) => ({ x: cp.x, y: cp.y }))
  }
  const count = t.seats ?? 0
  if (count <= 0) return []
  const tx = t.x ?? 0, ty = t.y ?? 0
  const tw = t.w ?? DEFAULT_W, th = t.h ?? DEFAULT_H
  const shape = t.shape ?? 'rect'
  const result: Array<{ x: number; y: number }> = []

  if (shape === 'circle') {
    const cx = tx + tw / 2, cy = ty + th / 2
    const r  = tw / 2 + CHAIR_R + CHAIR_GAP
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      result.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    }
  } else {
    const sides = [
      { dir: 'top',    n: Math.ceil(count / 4) },
      { dir: 'bottom', n: Math.ceil(count / 4) },
      { dir: 'left',   n: Math.floor(count / 4) },
      { dir: 'right',  n: Math.floor(count / 4) },
    ]
    let total = sides.reduce((s, d) => s + d.n, 0)
    let si = 0
    while (total > count) { sides[si % 4]!.n--; total--; si++ }
    while (total < count) { sides[si % 4]!.n++; total++; si++ }
    const inset = 12
    for (const side of sides) {
      for (let i = 0; i < side.n; i++) {
        const tVal = side.n === 1 ? 0.5 : i / (side.n - 1)
        let cx = 0, cy = 0
        if (side.dir === 'top')    { cx = tx + inset + tVal * (tw - inset * 2); cy = ty - CHAIR_R - CHAIR_GAP }
        else if (side.dir === 'bottom') { cx = tx + inset + tVal * (tw - inset * 2); cy = ty + th + CHAIR_R + CHAIR_GAP }
        else if (side.dir === 'left')   { cx = tx - CHAIR_R - CHAIR_GAP; cy = ty + inset + tVal * (th - inset * 2) }
        else                            { cx = tx + tw + CHAIR_R + CHAIR_GAP; cy = ty + inset + tVal * (th - inset * 2) }
        result.push({ x: cx, y: cy })
      }
    }
  }
  return result
}

// ── Wall SVG ──────────────────────────────────────────────────────────────

function WallSvg({ walls, width, height }: { walls: WallSegment[]; width: number; height: number }): React.ReactElement {
  return (
    <svg style={{ position: 'absolute', inset: 0, width, height, pointerEvents: 'none', zIndex: 0 }}>
      {walls.map((w) => (
        <line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
          stroke={w.color ?? '#555'} strokeWidth={w.thickness ?? 6} strokeLinecap="round" />
      ))}
    </svg>
  )
}

// ── Single floor canvas ────────────────────────────────────────────────────

function FloorCanvas({
  floor,
  tables,
  occupiedIds,
  selectedId,
  onSelect,
}: {
  floor: Floor
  tables: DiningTable[]
  occupiedIds: Set<string>
  selectedId: string
  onSelect: (id: string) => void
}): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  // Auto-fit the canvas to the available container width
  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new ResizeObserver(([entry]) => {
      if (!entry) return
      const available = entry.contentRect.width
      setScale(Math.min(1, available / floor.width))
    })
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [floor.width])

  return (
    <div ref={wrapRef} className="fmp-floor-wrap">
      <div
        className="fmp-canvas"
        style={{
          width:  floor.width,
          height: floor.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          flexShrink: 0,
          marginBottom: scale < 1 ? floor.height * scale - floor.height : 0,
        }}
      >
        {/* Walls */}
        <WallSvg walls={floor.walls ?? []} width={floor.width} height={floor.height} />

        {/* Chairs */}
        {tables.map((t) => {
          const pts = chairPositionsForTable(t)
          const isOccupied = occupiedIds.has(t.id)
          const isSelected = t.id === selectedId
          const chairColor = isSelected ? '#1d4ed8' : isOccupied ? '#b91c1c' : '#15803d'
          return pts.map((pt, i) => (
            <div
              key={`${t.id}-c${i}`}
              className="fmp-chair"
              style={{
                left: pt.x - CHAIR_R,
                top:  pt.y - CHAIR_R,
                width:  CHAIR_R * 2,
                height: CHAIR_R * 2,
                background: chairColor,
                opacity: 0.6,
                pointerEvents: 'none',
              }}
            />
          ))
        })}

        {/* Tables */}
        {tables.map((t) => {
          const x = t.x ?? 0, y = t.y ?? 0
          const w = t.w ?? DEFAULT_W, h = t.h ?? DEFAULT_H
          const shape = t.shape ?? 'rect'
          const rotation = t.rotation ?? 0
          const isOccupied = occupiedIds.has(t.id)
          const isSelected = t.id === selectedId
          const borderRadius = shape === 'circle' ? '50%' : '6px'

          let bg = 'var(--color-primary)'
          let border = 'var(--color-primary-dark)'
          if (isSelected) { bg = '#1d4ed8'; border = '#1e3a8a' }
          else if (isOccupied) { bg = '#b91c1c'; border = '#991b1b' }
          else { bg = '#15803d'; border = '#166534' }

          return (
            <button
              key={t.id}
              type="button"
              className={`fmp-table${isSelected ? ' fmp-table--selected' : ''}${isOccupied ? ' fmp-table--occupied' : ' fmp-table--available'}`}
              style={{
                position: 'absolute',
                left: x, top: y, width: w, height: h,
                borderRadius,
                background: bg,
                border: `2.5px solid ${border}`,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                cursor: 'pointer',
                zIndex: 2,
              }}
              onClick={() => onSelect(t.id)}
              title={isOccupied ? `${t.nameAr} — مشغولة` : t.nameAr}
            >
              <span className="fmp-table__label">{t.nameAr}</span>
              {isOccupied && <span className="fmp-table__status">مشغولة</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Fallback: simple list grid (when tables have no floor positions) ────────

function FallbackGrid({
  tables,
  occupiedIds,
  selectedId,
  onSelect,
}: {
  tables: DiningTable[]
  occupiedIds: Set<string>
  selectedId: string
  onSelect: (id: string) => void
}): React.ReactElement {
  const grouped = useMemo(() => {
    const map = new Map<string, DiningTable[]>()
    for (const t of tables) {
      const key = t.categoryAr?.trim() || 'بدون تصنيف'
      map.set(key, [...(map.get(key) ?? []), t])
    }
    return Array.from(map.entries()).map(([cat, tbls]) => ({ cat, tbls }))
  }, [tables])

  return (
    <div className="fmp-fallback">
      {grouped.map(({ cat, tbls }) => (
        <div key={cat} className="fmp-fallback__group">
          <h3 className="fmp-fallback__group-title">{cat}</h3>
          <div className="fmp-fallback__grid">
            {tbls.map((t) => {
              const occupied = occupiedIds.has(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  className={[
                    'fmp-fallback__btn',
                    selectedId === t.id  ? 'fmp-fallback__btn--selected'  : '',
                    occupied             ? 'fmp-fallback__btn--occupied'   : 'fmp-fallback__btn--available',
                  ].filter(Boolean).join(' ')}
                  onClick={() => onSelect(t.id)}
                >
                  <strong>{t.nameAr}</strong>
                  {occupied && <span>مشغولة</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── FloorMapPicker — main export ───────────────────────────────────────────

interface FloorMapPickerProps {
  tables: DiningTable[]
  occupiedIds: Set<string>
  selectedId: string
  onSelect: (tableId: string) => void
}

export function FloorMapPicker({ tables, occupiedIds, selectedId, onSelect }: FloorMapPickerProps): React.ReactElement {
  const [floors, setFloors] = useState<Floor[]>([])
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null)

  useEffect(() => {
    void listFloors().then((fl) => {
      setFloors(fl)
      if (fl.length > 0) setActiveFloorId(fl[0]!.id)
    })
  }, [])

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null

  // Tables that have a floor assignment and position
  const tablesWithFloor = tables.filter((t) => t.floorId && t.x != null)
  const hasFloorLayout  = floors.length > 0 && tablesWithFloor.length > 0

  // Tables on the active floor
  const floorTables = activeFloor
    ? tables.filter((t) => t.floorId === activeFloor.id && t.active)
    : []

  return (
    <div className="fmp-root">
      {hasFloorLayout ? (
        <>
          {/* Floor tabs */}
          {floors.length > 1 && (
            <div className="fmp-tabs">
              {floors.map((fl) => (
                <button key={fl.id} type="button"
                  className={`fmp-tab${activeFloorId === fl.id ? ' fmp-tab--active' : ''}`}
                  onClick={() => setActiveFloorId(fl.id)}>
                  {fl.nameAr}
                  <span className="fmp-tab__count">
                    {tables.filter((t) => t.floorId === fl.id).length}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="fmp-legend">
            <span className="fmp-legend__item fmp-legend__item--available">متاحة</span>
            <span className="fmp-legend__item fmp-legend__item--occupied">مشغولة</span>
            <span className="fmp-legend__item fmp-legend__item--selected">محددة</span>
          </div>

          {/* Canvas */}
          {activeFloor && (
            <FloorCanvas
              floor={activeFloor}
              tables={floorTables}
              occupiedIds={occupiedIds}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          )}

          {floorTables.length === 0 && (
            <p className="fmp-empty">لا توجد ترابيزات في هذه المنطقة</p>
          )}
        </>
      ) : (
        /* Fallback when no floor layout defined */
        tables.length === 0 ? (
          <p className="fmp-empty">لا توجد ترابيزات مفعلة</p>
        ) : (
          <FallbackGrid
            tables={tables}
            occupiedIds={occupiedIds}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )
      )}
    </div>
  )
}
