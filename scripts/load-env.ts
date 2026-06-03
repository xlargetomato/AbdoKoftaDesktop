import { config } from 'dotenv'
import { resolve } from 'node:path'

/** Load .env then .env.local — non-empty local values override .env (matches Vite intent) */
export function loadEnv(): void {
  const root = process.cwd()
  config({ path: resolve(root, '.env') })
  const local = config({ path: resolve(root, '.env.local') })
  if (local.parsed) {
    for (const [key, value] of Object.entries(local.parsed)) {
      if (value !== '') process.env[key] = value
    }
  }
}
