export type UserRole = 'manager' | 'cashier'

export interface AppUser {
  id: string
  email: string
  username: string
  displayName: string
  cashierCode?: string
  role: UserRole
  active: boolean
  pinHash?: string        // SHA-256 of the 4-digit PIN, undefined = no PIN set
  createdAt: number
  updatedAt: number
}

export interface AppUserCreate {
  username: string        // manager types this, email is derived internally
  displayName: string
  cashierCode?: string
  role: UserRole
  password: string
}

/** Convert a username to a Firebase-compatible email */
export function usernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}@abdokofta.local`
}
