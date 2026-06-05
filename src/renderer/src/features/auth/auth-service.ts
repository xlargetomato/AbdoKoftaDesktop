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
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth'
import type { AppUser, AppUserCreate, UserRole } from '@shared/types'
import { usernameToEmail } from '@shared/types/user'
import { collections, doc, auth } from '@renderer/lib/firebase'
import { mapDoc } from '@renderer/lib/utils/firestore-mapper'

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'اسم المستخدم أو كلمة المرور غير صحيحة',
  'auth/wrong-password': 'كلمة المرور غير صحيحة',
  'auth/user-not-found': 'لا يوجد حساب بهذا المستخدم',
  'auth/invalid-email': 'اسم المستخدم غير صالح',
  'auth/too-many-requests': 'محاولات كثيرة - انتظر قليلا ثم حاول مجددا',
  'auth/network-request-failed': 'تحقق من الاتصال بالإنترنت',
  'auth/email-already-in-use': 'اسم المستخدم مستخدم بالفعل'
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
  try {
    const snap = await getDoc(doc(collections.users(), uid))
    if (!snap.exists()) {
      console.warn('[auth] users doc missing for uid:', uid)
      return null
    }
    const data = snap.data()
    return {
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
  } catch (e) {
    console.error('[auth] fetchAppUser failed:', e)
    throw toAuthError(e)
  }
}

/** Login with username - converts to email internally */
export async function loginAndLoadUser(
  username: string,
  password: string
): Promise<AppUser> {
  const email = usernameToEmail(username)
  let cred
  try {
    cred = await signInWithEmailAndPassword(auth, email, password)
  } catch (e) {
    throw toAuthError(e)
  }
  const appUser = await fetchAppUser(cred.user.uid)
  if (!appUser || !appUser.active) {
    await signOut(auth)
    throw new Error('الحساب غير موجود في قاعدة البيانات - شغّل: npm run seed')
  }
  return appUser
}

export async function createCashierAccount(
  data: AppUserCreate,
  createdByManagerId: string
): Promise<AppUser> {
  const username = data.username.toLowerCase().trim()
  const email = usernameToEmail(username)
  if (data.role === 'cashier' && data.cashierCode) {
    await assertCashierCodeAvailable(data.cashierCode)
  }
  const cred = await createUserWithEmailAndPassword(auth, email, data.password)
  const now = Date.now()
  const appUser: AppUser = {
    id: cred.user.uid,
    email,
    username,
    displayName: data.displayName,
    cashierCode: data.cashierCode?.toUpperCase(),
    role: data.role,
    active: true,
    createdAt: now,
    updatedAt: now
  }
  await setDoc(doc(collections.users(), cred.user.uid), {
    ...appUser,
    createdBy: createdByManagerId
  })
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
  const q = query(collections.users(), where('role', '==', role))
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapDoc<AppUser>(d))
}

export async function updateUserActive(userId: string, active: boolean): Promise<void> {
  await updateDoc(doc(collections.users(), userId), { active, updatedAt: Date.now() })
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<Pick<AppUser, 'displayName' | 'username' | 'pinHash' | 'cashierCode'>>
): Promise<void> {
  if (patch.cashierCode) {
    await assertCashierCodeAvailable(patch.cashierCode, userId)
    patch.cashierCode = patch.cashierCode.toUpperCase()
  }
  await updateDoc(doc(collections.users(), userId), { ...patch, updatedAt: Date.now() })
}

export async function resetCashierPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  if (!navigator.onLine) throw new Error('لا يمكن تغيير كلمة المرور بدون اتصال')
  const result = await window.electronAPI.resetAuthUserPassword(userId, newPassword)
  if (!result.ok) throw new Error(result.error ?? 'فشل تغيير كلمة المرور')
}

export async function deleteCashierAccount(userId: string): Promise<void> {
  const snap = await getDoc(doc(collections.users(), userId))
  if (!snap.exists()) return
  const user = snap.data() as AppUser
  if (user.role !== 'cashier') throw new Error('يمكن حذف حسابات الكاشير فقط')
  if (window.electronAPI?.deleteAuthUser) {
    const result = await window.electronAPI.deleteAuthUser(userId)
    if (!result.ok) console.warn('[auth] Firebase Auth delete failed:', result.error)
  }
  await deleteDoc(doc(collections.users(), userId))
}