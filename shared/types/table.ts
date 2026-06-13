export type TableShape = 'rect' | 'circle' | 'round_rect'

export interface DiningTable {
  id: string
  nameAr: string
  categoryAr?: string
  sortOrder: number
  active: boolean
  /** Floor this table belongs to (undefined = legacy / no floor) */
  floorId?: string
  /** Position on the floor canvas — logical pixels */
  x?: number
  y?: number
  /** Size on the canvas — logical pixels */
  w?: number
  h?: number
  /** Visual shape */
  shape?: TableShape
  /** Number of chairs drawn around the table */
  seats?: number
  /** Rotation in degrees (0, 90, 180, 270) */
  rotation?: number
  createdAt: number
  updatedAt: number
}

/** A floor / area of the restaurant (Salon, Garden, Rooftop …) */
export interface Floor {
  id: string
  nameAr: string
  /** Canvas logical width in px */
  width: number
  /** Canvas logical height in px */
  height: number
  /** Background color of the canvas */
  bgColor?: string
  sortOrder: number
  active: boolean
  createdAt: number
  updatedAt: number
}
