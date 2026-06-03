import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { assertFirebaseConfig, firebaseConfig } from './config'

assertFirebaseConfig()

let app: FirebaseApp

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig)
  }
  return app
}

export { firebaseConfig }
