import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  initializeApp,
  cert,
  applicationDefault,
  getApps,
  type ServiceAccount
} from 'firebase-admin/app'

function projectId(): string {
  return (
    process.env.VITE_FIREBASE_PROJECT_ID ??
    process.env.FIREBASE_PROJECT_ID ??
    ''
  )
}

function printSetupInstructions(): never {
  const pid = projectId() || 'YOUR_PROJECT_ID'
  const expected = resolve(process.cwd(), 'service-account.json')
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH

  console.error(`
Service account key is required for npm run seed.

1. Open Firebase Console → Project settings → Service accounts:
   https://console.firebase.google.com/project/${pid}/settings/serviceaccounts/adminsdk

2. Click "Generate new private key" and download the JSON file.

3. Save it as:
   ${expected}
   ${configured ? `\n   (or update FIREBASE_SERVICE_ACCOUNT_PATH in .env.local — currently: ${configured})` : ''}

4. Run again:
   npm run seed

Alternative: set FIREBASE_SERVICE_ACCOUNT_JSON in .env.local to the full JSON on one line.
`)
  process.exit(1)
}

function loadFromJsonEnv(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as ServiceAccount
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON')
  }
}

function loadFromFile(): ServiceAccount | null {
  const configured =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!configured) return null

  const path = resolve(process.cwd(), configured)
  if (!existsSync(path)) {
    throw new Error(`Service account file not found: ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount
}

export function initFirebaseAdmin(): void {
  if (getApps().length) return

  const pid = projectId()
  const fromJson = loadFromJsonEnv()
  if (fromJson) {
    initializeApp({
      credential: cert(fromJson),
      ...(pid ? { projectId: pid } : {})
    })
    return
  }

  try {
    const fromFile = loadFromFile()
    if (fromFile) {
      initializeApp({
        credential: cert(fromFile),
        ...(pid ? { projectId: pid } : {})
      })
      return
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found')) {
      printSetupInstructions()
    }
    throw e
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    printSetupInstructions()
  }

  try {
    initializeApp({
      credential: applicationDefault(),
      ...(pid ? { projectId: pid } : {})
    })
  } catch {
    printSetupInstructions()
  }
}
