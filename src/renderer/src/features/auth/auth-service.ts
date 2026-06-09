import {
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc
} from 'firebase/firestore'
import {
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth'
import type { AppUser, AppUserCreate, UserRole } from '@shared/types'
import { usernameToEmail } from '@shared/types/user'
import { collections, doc, auth } from '@renderer/lib/firebase'
import { mapDoc } from '@renderer/lib/utils/firestore-mapper'
import { COLLECTIONS } from '@shared/constants/collections'
import {
  cacheDocs,
  getCachedDoc,
  getCachedDocs,
  isAppOffline,
  isOfflineError,
  mergeAndCacheLocalFirst,
  mergeDocAndCacheLocalFirst
} from '@renderer/lib/offline/sqlite-cache'

const OFFLINE_AUTH_KEY = 'abdokofta.offlineAuth.v1'
const PENDING_LOCAL_AUTH_KEY = 'abdokofta.pendingLocalAuth.v1'

interface CachedAuthUser {
  username: string
  passwordHash: string
  user: AppUser
  updatedAt: number
}

export interface PendingLocalAuthUser {
  uid: string
  email: string
  username: string
  password: string
  displayName: string
  updatedAt: number
}

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'اسم المستخدم أو كلمة المرور غير صحيحة',
  'auth/wrong-password': 'كلمة المرور غير صحيحة',
  'auth/user-not-found': 'لا يوجد حساب بهذا المستخدم',
  'auth/invalid-email': 'اسم المستخدم غير صالح',
  'auth/too-many-requests': 'محاولات كثيرة - انتظر قليلا ثم حاول مجددا',
  'auth/network-request-failed': 'تحقق من الاتصال بالإنترنت',
  'auth/email-already-in-use': 'اسم المستخدم مستخدم بالفعل'
}

function normalizeUsername(username: string): string {
  return username.toLowerCase().trim()
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function readOfflineAuthUsers(): CachedAuthUser[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_AUTH_KEY) ?? '[]') as CachedAuthUser[]
  } catch {
    return []
  }
}

function writeOfflineAuthUsers(users: CachedAuthUser[]): void {
  localStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify(users))
}

function readPendingLocalAuthUsers(): PendingLocalAuthUser[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_LOCAL_AUTH_KEY) ?? '[]') as PendingLocalAuthUser[]
  } catch {
    return []
  }
}

function writePendingLocalAuthUsers(users: PendingLocalAuthUser[]): void {
  localStorage.setItem(PENDING_LOCAL_AUTH_KEY, JSON.stringify(users))
}

function rememberPendingLocalAuthUser(user: AppUser, password: string): void {
  if (!user.id.startsWith('local_')) return
  const pending = readPendingLocalAuthUsers().filter((entry) => entry.uid !== user.id)
  pending.push({
    uid: user.id,
    email: user.email,
    username: user.username,
    password,
    displayName: user.displayName,
    updatedAt: Date.now()
  })
  writePendingLocalAuthUsers(pending)
}

async function cacheLocalUserWithPassword(user: AppUser, password: string): Promise<void> {
  await cacheOfflineLogin(user, password)
  rememberPendingLocalAuthUser(user, password)
}

function canFallbackToLocal(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? ''
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    isOfflineError(err) ||
    code.includes('permission-denied') ||
    code.includes('not-found') ||
    code.includes('user-not-found') ||
    message.includes('no user record') ||
    message.includes('permission') ||
    message.includes('missing or insufficient permissions')
  )
}

export function getPendingLocalAuthUsers(): PendingLocalAuthUser[] {
  return readPendingLocalAuthUsers()
}

export function clearPendingLocalAuthUser(uid: string): void {
  writePendingLocalAuthUsers(readPendingLocalAuthUsers().filter((entry) => entry.uid !== uid))
}

async function cacheOfflineLogin(user: AppUser, password: string): Promise<void> {
  const username = normalizeUsername(user.username)
  const passwordHash = await sha256(`${username}:${password}`)
  const users = readOfflineAuthUsers().filter((entry) => entry.username !== username)
  users.push({ username, passwordHash, user, updatedAt: Date.now() })
  writeOfflineAuthUsers(users)
  await cacheDocs(COLLECTIONS.users, [user])
}

async function tryOfflineLogin(usernameInput: string, password: string): Promise<AppUser | null> {
  const username = normalizeUsername(usernameInput)
  const passwordHash = await sha256(`${username}:${password}`)
  const cached = readOfflineAuthUsers().find(
    (entry) => entry.username === username && entry.passwordHash === passwordHash
  )
  if (!cached?.user.active) return null
  rememberPendingLocalAuthUser(cached.user, password)
  return cached.user
}

export function hasOfflineAuthUsers(): boolean {
  return readOfflineAuthUsers().length > 0
}

export async function createFirstOfflineManager(params: {
  username: string
  password: string
  displayName?: string
}): Promise<AppUser> {
  if (hasOfflineAuthUsers()) {
    throw new Error('يوجد حساب محلي بالفعل')
  }
  const username = normalizeUsername(params.username)
  if (!username) throw new Error('اسم المستخدم مطلوب')
  if (params.password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
  const now = Date.now()
  const user: AppUser = {
    id: `local_${username}`,
    email: usernameToEmail(username),
    username,
    displayName: params.displayName?.trim() || username,
    role: 'manager',
    active: true,
    createdAt: now,
    updatedAt: now
  }
  await cacheOfflineLogin(user, params.password)
  rememberPendingLocalAuthUser(user, params.password)
  return user
}

function toAuthError(err: unknown): Error {
  const code = (err as { code?: string })?.code
  if (code === 'permission-denied') {
    return new Error('لا يمكن قراءة ملف المستخدم - شغّل: npm run deploy:rules')
  }
  if (code && AUTH_ERRORS[code]) return new Error(AUTH_ERRORS[code]!)
  if (err instanceof Error) return err
  return new Error('فشل تسجيل الدخول')
}

export async function fetchAppUser(uid: string): Promise<AppUser | null> {
  if (isAppOffline()) {
    return getCachedDoc<AppUser>(COLLECTIONS.users, uid)
  }
  try {
    const snap = await getDoc(doc(collections.users(), uid))
    if (!snap.exists()) {
      console.warn('[auth] users doc missing for uid:', uid)
      return null
    }
    const data = snap.data()
    const user = {
      id: snap.id,
      email: data.email as string,
      username: (data.username as string) || (data.email as string).split('@')[0],
      displayName: data.displayName as string,
      cashierCode: data.cashierCode as string | undefined,
      role: data.role as AppUser['role'],
      active: data.active as boolean,
      pinHash: data.pinHash as string | undefined,
      createdAt: data.createdAt as number,
      updatedAt: data.updatedAt as number
    }
    return await mergeDocAndCacheLocalFirst(COLLECTIONS.users, user, uid)
  } catch (e) {
    const cached = await getCachedDoc<AppUser>(COLLECTIONS.users, uid)
    if (cached) return cached
    console.error('[auth] fetchAppUser failed:', e)
    throw toAuthError(e)
  }
}

/** Login with username - converts to email internally */
export async function loginAndLoadUser(
  username: string,
  password: string
): Promise<AppUser> {
  if (isAppOffline()) {
    const offlineUser = await tryOfflineLogin(username, password)
    if (offlineUser) return offlineUser
    throw new Error('لا يوجد حساب محلي مطابق للعمل بدون إنترنت')
  }
  const email = usernameToEmail(username)
  let cred
  try {
    cred = await signInWithEmailAndPassword(auth, email, password)
  } catch (e) {
    if (canFallbackToLocal(e)) {
      const offlineUser = await tryOfflineLogin(username, password)
      if (offlineUser) return offlineUser
    }
    throw toAuthError(e)
  }
  const appUser = await fetchAppUser(cred.user.uid)
  if (!appUser || !appUser.active) {
    await signOut(auth)
    throw new Error('الحساب غير موجود في قاعدة البيانات - شغّل: npm run seed')
  }
  await cacheOfflineLogin(appUser, password)
  return appUser
}

export async function createCashierAccount(
  data: AppUserCreate,
  createdByManagerId: string
): Promise<AppUser> {
  const username = data.username.toLowerCase().trim()
  const email = usernameToEmail(username)
  const now = Date.now()
  const appUser: AppUser = {
    id: `local_${username}`,
    email,
    username,
    displayName: data.displayName,
    cashierCode: data.cashierCode?.toUpperCase(),
    role: data.role,
    active: true,
    createdAt: now,
    updatedAt: now
  }

  if (!isAppOffline() && data.role === 'cashier' && data.cashierCode) {
    try {
      await assertCashierCodeAvailable(data.cashierCode)
    } catch (e) {
      if (!canFallbackToLocal(e)) throw e
    }
  }

  await cacheLocalUserWithPassword({
    ...appUser,
    createdBy: createdByManagerId
  } as AppUser, data.password)
  return appUser
}
async function assertCashierCodeAvailable(
  cashierCode: string,
  exceptUserId?: string
): Promise<void> {
  const code = cashierCode.trim().toUpperCase()
  if (!/^[A-Z0-9]{2}$/.test(code)) {
    throw new Error('كود الكاشير يجب أن يكون حرفين أو رقمين فقط')
  }
  const q = query(collections.users(), where('cashierCode', '==', code))
  const snap = await getDocs(q)
  const taken = snap.docs.some((d) => d.id !== exceptUserId)
  if (taken) throw new Error('كود الكاشير مستخدم بالفعل')
}

export async function listUsersByRole(role: UserRole): Promise<AppUser[]> {
  if (isAppOffline()) {
    return (await getCachedDocs<AppUser>(COLLECTIONS.users)).filter((user) => user.role === role)
  }
  try {
    const q = query(collections.users(), where('role', '==', role))
    const snap = await getDocs(q)
    const remoteUsers = snap.docs.map((d) => mapDoc<AppUser>(d))
    const users = await mergeAndCacheLocalFirst(COLLECTIONS.users, remoteUsers)
    return users.filter((user) => user.role === role)
  } catch (e) {
    const users = await getCachedDocs<AppUser>(COLLECTIONS.users)
    if (users.length) return users.filter((user) => user.role === role)
    throw e
  }
}

export async function updateUserActive(userId: string, active: boolean): Promise<void> {
  const cached = await getCachedDoc<AppUser>(COLLECTIONS.users, userId)
  if (cached) await cacheDocs(COLLECTIONS.users, [{ ...cached, active, updatedAt: Date.now() }])
  if (isAppOffline() || userId.startsWith('local_')) return

  try {
    await updateDoc(doc(collections.users(), userId), { active, updatedAt: Date.now() })
  } catch (e) {
    if (!canFallbackToLocal(e)) throw e
  }
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<Pick<AppUser, 'displayName' | 'username' | 'pinHash' | 'cashierCode'>>
): Promise<void> {
  const normalizedPatch = {
    ...patch,
    cashierCode: patch.cashierCode?.toUpperCase()
  }
  const cached = await getCachedDoc<AppUser>(COLLECTIONS.users, userId)
  if (cached) await cacheDocs(COLLECTIONS.users, [{ ...cached, ...normalizedPatch, updatedAt: Date.now() }])
  if (isAppOffline() || userId.startsWith('local_')) return

  try {
    if (normalizedPatch.cashierCode) {
      await assertCashierCodeAvailable(normalizedPatch.cashierCode, userId)
    }
    await updateDoc(doc(collections.users(), userId), { ...normalizedPatch, updatedAt: Date.now() })
  } catch (e) {
    if (!canFallbackToLocal(e)) throw e
  }
}

export async function resetCashierPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const cached = await getCachedDoc<AppUser>(COLLECTIONS.users, userId)
  if (cached) await cacheLocalUserWithPassword({ ...cached, updatedAt: Date.now() }, newPassword)
  if (isAppOffline() || userId.startsWith('local_')) return

  const result = await window.electronAPI.resetAuthUserPassword(userId, newPassword)
  if (!result.ok) {
    const err = new Error(result.error ?? 'Failed to reset password')
    if (!canFallbackToLocal(err)) throw err
  }
}
export async function deleteCashierAccount(userId: string): Promise<void> {
  const cached = await getCachedDoc<AppUser>(COLLECTIONS.users, userId)
  if (cached) {
    await cacheDocs(COLLECTIONS.users, [{ ...cached, active: false, updatedAt: Date.now() }])
  }
  if (isAppOffline() || userId.startsWith('local_')) return

  let user: AppUser | null = cached
  try {
    const snap = await getDoc(doc(collections.users(), userId))
    if (snap.exists()) user = snap.data() as AppUser
  } catch (e) {
    if (!canFallbackToLocal(e)) throw e
  }
  if (user && user.role !== 'cashier') throw new Error('يمكن حذف حسابات الكاشير فقط')

  if (window.electronAPI?.deleteAuthUser) {
    const result = await window.electronAPI.deleteAuthUser(userId)
    if (!result.ok) {
      const err = new Error(result.error ?? 'Failed to delete auth user')
      if (!canFallbackToLocal(err)) console.warn('[auth] Firebase Auth delete failed:', result.error)
    }
  }

  try {
    await deleteDoc(doc(collections.users(), userId))
  } catch (e) {
    if (!canFallbackToLocal(e)) throw e
  }
}
