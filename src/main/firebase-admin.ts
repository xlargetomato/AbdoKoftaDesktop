import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { app } from 'electron'
import {
  initializeApp,
  cert,
  getApps,
  type App as FirebaseAdminApp
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

let adminApp: FirebaseAdminApp | null = null

function serviceAccountPath(): string {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  const candidates = [
    fromEnv ? resolve(process.cwd(), fromEnv) : '',
    resolve(process.cwd(), 'service-account.json'),
    resolve(app.getAppPath(), 'service-account.json')
  ].filter(Boolean)

  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error('service-account.json not found for auth user deletion')
}

function getAdminApp(): FirebaseAdminApp {
  if (adminApp) return adminApp
  if (getApps().length) {
    adminApp = getApps()[0]!
    return adminApp
  }
  const sa = JSON.parse(readFileSync(serviceAccountPath(), 'utf8'))
  adminApp = initializeApp({ credential: cert(sa) })
  return adminApp
}

export async function deleteAuthUser(uid: string): Promise<void> {
  await getAuth(getAdminApp()).deleteUser(uid)
}

export async function resetAuthUserPassword(uid: string, newPassword: string): Promise<void> {
  await getAuth(getAdminApp()).updateUser(uid, { password: newPassword })
}

export async function ensureAuthUser(params: {
  uid: string
  email: string
  password: string
  displayName: string
}): Promise<void> {
  const auth = getAuth(getAdminApp())
  try {
    await auth.getUser(params.uid)
    await auth.updateUser(params.uid, {
      email: params.email,
      password: params.password,
      displayName: params.displayName,
      disabled: false
    })
  } catch (e) {
    const code = (e as { code?: string }).code
    const message = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase()
    const missing = code === 'auth/user-not-found' || message.includes('no user record')
    if (!missing) throw e
    await auth.createUser({
      uid: params.uid,
      email: params.email,
      password: params.password,
      displayName: params.displayName,
      disabled: false
    })
  }
}

export async function readAdminDocument(
  collectionName: string,
  documentId: string
): Promise<unknown | null> {
  const snap = await getFirestore(getAdminApp()).collection(collectionName).doc(documentId).get()
  if (!snap.exists) return null
  return { id: snap.id, ...snap.data() }
}

export async function writeAdminDocument(
  collectionName: string,
  documentId: string,
  data: unknown
): Promise<void> {
  await getFirestore(getAdminApp())
    .collection(collectionName)
    .doc(documentId)
    .set(data as Record<string, unknown>, { merge: true })
}
