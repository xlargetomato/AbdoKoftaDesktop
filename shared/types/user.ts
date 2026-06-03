export type UserRole = 'manager' | 'cashier'

export interface AppUser {
  id: string
  email: string
  displayName: string
  role: UserRole
  active: boolean
  createdAt: number
  updatedAt: number
}

export interface AppUserCreate {
  email: string
  displayName: string
  role: UserRole
  password: string
}
