/**
 * Verifies Auth users exist and client sign-in + Firestore profile read works.
 * Run: npm run verify:login
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore, doc, getDoc } from 'firebase/firestore'
import { loadEnv } from './load-env'
import { initFirebaseAdmin } from './firebase-admin-init'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'

loadEnv()

const email = process.env.SEED_MANAGER_EMAIL ?? 'manager@abdokofta.local'
const password = process.env.SEED_MANAGER_PASSWORD ?? 'Manager123!'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
}

async function main(): Promise<void> {
  console.log('Verify login for:', email, '\n')

  initFirebaseAdmin()
  try {
    const adminUser = await getAdminAuth().getUserByEmail(email)
    console.log('✓ Auth user exists, uid:', adminUser.uid)
  } catch (e) {
    console.error('✗ Auth user missing — run: npm run seed')
    process.exit(1)
  }

  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    console.log('✓ Sign-in succeeded, uid:', cred.user.uid)

    try {
      const snap = await getDoc(doc(db, 'users', cred.user.uid))
      if (!snap.exists()) {
        console.error('✗ Firestore users/{uid} document missing — run: npm run seed')
        process.exit(1)
      }
      console.log('✓ Profile read OK:', snap.data())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
        console.error(`
✗ Firestore denied reading users/{uid}.

Deploy security rules:
  npm run deploy:rules
`)
        process.exit(1)
      }
      throw e
    }

    await signOut(auth)
    console.log('\nLogin flow OK.')
  } catch (e: unknown) {
    const code = (e as { code?: string }).code
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      console.error('✗ Wrong email or password. Re-run: npm run seed')
    } else if (code === 'auth/invalid-email') {
      console.error('✗ Invalid email format')
    } else {
      console.error('✗ Sign-in failed:', e)
    }
    process.exit(1)
  }
}

main()
