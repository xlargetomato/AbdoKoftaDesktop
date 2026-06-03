import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth'
import { getFirebaseApp } from './app'

export const auth = getAuth(getFirebaseApp())

export { signInWithEmailAndPassword, signOut, onAuthStateChanged, type User }
