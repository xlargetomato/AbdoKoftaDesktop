/**
 * Firebase module — loaded lazily by the background sync service.
 * Nothing here is imported at app boot; only the outbox uploader
 * pulls these in when it needs to upload to Firebase.
 */
export { firebaseConfig, getFirebaseApp } from './app'
export { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './auth'
export {
  getDb,
  enableOfflinePersistence,
  collections,
  doc
} from './firestore'
