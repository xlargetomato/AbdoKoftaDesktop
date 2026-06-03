/**
 * Deploy firestore.rules using the service account (no firebase login required).
 * Run: npm run deploy:rules
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GoogleAuth } from 'google-auth-library'
import { loadEnv } from './load-env'

loadEnv()

const projectId =
  process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID
if (!projectId) throw new Error('Set VITE_FIREBASE_PROJECT_ID in .env.local')

const keyPath = resolve(
  process.cwd(),
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? './service-account.json'
)

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
    keyFile: keyPath,
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
