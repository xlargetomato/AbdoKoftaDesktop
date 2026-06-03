import { loadEnv } from './load-env'
import { projectId, waitForFirestoreReady } from './ensure-firebase'

loadEnv()

const pid = projectId()
console.log('Opening Firebase setup pages for:', pid, '\n')
await waitForFirestoreReady(pid, 600_000)
console.log('Firebase is ready. Run: npm run seed')
