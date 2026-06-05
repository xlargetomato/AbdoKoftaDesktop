/**
 * Deploy firestore.rules using a service account (no firebase login required).
 * Run: npm run deploy:rules
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GoogleAuth } from 'google-auth-library'
import { loadEnv } from './load-env'

loadEnv()

const projectId =
  process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID
if (!projectId) throw new Error('Set VITE_FIREBASE_PROJECT_ID in .env or .env.local')

function serviceAccountHelp(): string {
  const expected = resolve(process.cwd(), 'service-account.json')
  return `Service account key is required.

1. Open Firebase Console -> Project settings -> Service accounts:
   https://console.firebase.google.com/project/${projectId}/settings/serviceaccounts/adminsdk

2. Click "Generate new private key" and download the JSON file.

3. Either save it as:
   ${expected}

   or set FIREBASE_SERVICE_ACCOUNT_PATH in .env.local,
   or set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON on one line.

4. Run again:
   npm run deploy:rules`
}

function loadCredentials(): { keyFile?: string; credentials?: Record<string, unknown> } {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (rawJson) {
    try {
      return { credentials: JSON.parse(rawJson) as Record<string, unknown> }
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON')
    }
  }

  const configured =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    './service-account.json'
  const keyFile = resolve(process.cwd(), configured)
  if (!existsSync(keyFile)) {
    throw new Error(`${serviceAccountHelp()}\n\nMissing file: ${keyFile}`)
  }
  return { keyFile }
}

async function request<T>(
  auth: GoogleAuth,
  method: string,
  url: string,
  body?: unknown
): Promise<T> {
  const client = await auth.getClient()
  const res = await client.request<T>({ method, url, data: body })
  return res.data
}

async function main(): Promise<void> {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')
  const auth = new GoogleAuth({
    ...loadCredentials(),
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/firebase'
    ]
  })

  console.log('Deploying Firestore rules to', projectId, '...\n')

  const ruleset = await request<{ name: string }>(
    auth,
    'POST',
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    {
      source: {
        files: [{ name: 'firestore.rules', content: rules }]
      }
    }
  )

  await request(
    auth,
    'PATCH',
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore?updateMask=rulesetName`,
    {
      release: {
        name: `projects/${projectId}/releases/cloud.firestore`,
        rulesetName: ruleset.name
      }
    }
  )

  console.log('✓ Firestore rules deployed successfully')
  console.log('  Run: npm run verify:login')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`
Failed to deploy rules automatically.

Paste firestore.rules manually in Firebase Console:
  https://console.firebase.google.com/project/${projectId}/firestore/rules

Error: ${msg}
`)
  process.exit(1)
})
