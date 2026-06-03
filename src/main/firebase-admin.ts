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
