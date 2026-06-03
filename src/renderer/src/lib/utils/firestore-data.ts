/** Firestore rejects `undefined` field values — omit them before writes */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}
