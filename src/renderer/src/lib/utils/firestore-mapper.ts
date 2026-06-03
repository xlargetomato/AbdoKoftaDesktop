import type { DocumentData, DocumentSnapshot } from 'firebase/firestore'

export function mapDoc<T extends { id: string }>(
  snap: DocumentSnapshot<DocumentData>
): T {
  const data = snap.data() ?? {}
  // Firestore doc id wins — stored `id` field from old addDoc seeds must not override
  return { ...data, id: snap.id } as T
}

export function stripId<T extends { id: string }>(
  data: T
): Omit<T, 'id'> {
  const { id: _id, ...rest } = data
  return rest
}
