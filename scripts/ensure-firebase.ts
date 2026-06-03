import { spawn } from 'node:child_process'
import { getFirestore } from 'firebase-admin/firestore'
import { initFirebaseAdmin } from './firebase-admin-init'

export function projectId(): string {
  const id =
    process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID
  if (!id) throw new Error('Set VITE_FIREBASE_PROJECT_ID in .env.local')
  return id
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** True when Admin SDK can read/write Firestore (same path seed uses) */
export async function isFirestoreReady(): Promise<boolean> {
  try {
    initFirebaseAdmin()
    const db = getFirestore()
    const ref = db.collection('_seed_probe').doc('ping')
    await ref.set({ checkedAt: Date.now() }, { merge: true })
    await ref.get()
    return true
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const code = (e as { code?: number }).code
    if (
      code === 7 ||
      msg.includes('SERVICE_DISABLED') ||
      msg.includes('has not been used') ||
      msg.includes('NOT_FOUND')
    ) {
      return false
    }
    throw e
  }
}

function openUrl(url: string): void {
  const platform = process.platform
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
  } else if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' })
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
  }
}

export function printManualSteps(pid: string): void {
  console.log(`
Firestore is not set up yet for "${pid}".

In the browser window that just opened:

  1. Click "Create database" on the Firestore page
  2. Choose a location (e.g. europe-west) → Next
  3. Start in Production mode → Enable

Also enable Email/Password sign-in:
  https://console.firebase.google.com/project/${pid}/authentication/providers

This script will continue automatically once Firestore is ready...
`)
}

export async function waitForFirestoreReady(
  pid: string,
  maxWaitMs = 300_000
): Promise<void> {
  if (await isFirestoreReady()) {
    console.log('0. Firestore is ready\n')
    return
  }

  printManualSteps(pid)
  openUrl(`https://console.firebase.google.com/project/${pid}/firestore`)

  const started = Date.now()
  let attempt = 0
  while (Date.now() - started < maxWaitMs) {
    attempt++
    if (await isFirestoreReady()) {
      console.log(`\n  ✓ Firestore ready (${attempt} checks, ${Math.round((Date.now() - started) / 1000)}s)\n`)
      return
    }
    const elapsed = Math.round((Date.now() - started) / 1000)
    process.stdout.write(`  … waiting for Firestore setup (${elapsed}s)\r`)
    await sleep(5000)
  }

  throw new Error(
    `Timed out after ${maxWaitMs / 1000}s. Finish Firestore in the console, then run: npm run seed`
  )
}

/** Block until Firestore accepts writes, then continue */
export async function ensureFirebaseProjectReady(): Promise<void> {
  const pid = projectId()
  console.log('0. Checking Firebase project:', pid)
  await waitForFirestoreReady(pid)
}
