import { RESTAURANT_NAME_AR } from '@shared/constants/branding'

/** Firebase web config from .env / .env.local */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? ''
}

export function assertFirebaseConfig(): void {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v || v.startsWith('YOUR_'))
    .map(([k]) => k)

  if (missing.length > 0) {
    const msg = `[Firebase] Missing config in .env.local: ${missing.join(', ')}`
    console.error(msg)
    throw new Error('إعدادات Firebase غير مكتملة — راجع ملف .env.local')
  }

  console.info(`[Firebase] project: ${firebaseConfig.projectId}`)
}
