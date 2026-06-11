import { app } from 'electron'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

type DatabaseSync = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    get: (...params: unknown[]) => unknown
    all: (...params: unknown[]) => unknown[]
    run: (...params: unknown[]) => { changes?: number }
  }
  pragma?: (sql: string) => unknown
}

let db: DatabaseSync | null = null

export interface LocalStoreStatus {
  ok: boolean
  path: string
  pendingOutbox: number
  error?: string
}

function dbPath(): string {
  return join(app.getPath('userData'), 'offline-pos.sqlite')
}

function openDatabase(): DatabaseSync {
  if (db) return db
  const sqlite = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync }
  db = new sqlite.DatabaseSync(dbPath())
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created
      ON sync_outbox(status, created_at);

    CREATE TABLE IF NOT EXISTS cached_documents (
      collection_name TEXT NOT NULL,
      document_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (collection_name, document_id)
    );
  `)
  return db
}

export function initLocalStore(): LocalStoreStatus {
  try {
    const database = openDatabase()
    const row = database.prepare(
      "SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'"
    ).get() as { count?: number } | undefined
    return { ok: true, path: dbPath(), pendingOutbox: Number(row?.count ?? 0) }
  } catch (e) {
    return {
      ok: false,
      path: dbPath(),
      pendingOutbox: 0,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export function getLocalStoreStatus(): LocalStoreStatus {
  return initLocalStore()
}

// ---------------------------------------------------------------------------
// Core document cache (unchanged — used by IPC local-cache:* handlers)
// ---------------------------------------------------------------------------

export function cacheDocuments(
  collectionName: string,
  documents: Array<{ id: string; data: unknown }>
): void {
  const database = openDatabase()
  const stmt = database.prepare(`
    INSERT INTO cached_documents (collection_name, document_id, payload_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(collection_name, document_id)
    DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
  `)
  const now = Date.now()
  for (const document of documents) {
    stmt.run(collectionName, document.id, JSON.stringify(document.data), now)
  }
}

export function readCachedDocuments(collectionName: string): unknown[] {
  const database = openDatabase()
  const rows = database.prepare(`
    SELECT payload_json
    FROM cached_documents
    WHERE collection_name = ?
    ORDER BY updated_at DESC
  `).all(collectionName) as Array<{ payload_json: string }>
  return rows.map((row) => JSON.parse(row.payload_json) as unknown)
}

export function readCachedDocument(collectionName: string, documentId: string): unknown | null {
  const database = openDatabase()
  const row = database.prepare(`
    SELECT payload_json
    FROM cached_documents
    WHERE collection_name = ? AND document_id = ?
  `).get(collectionName, documentId) as { payload_json: string } | undefined
  return row ? JSON.parse(row.payload_json) as unknown : null
}

export function deleteCachedDocument(collectionName: string, documentId: string): boolean {
  const database = openDatabase()
  const result = database.prepare(`
    DELETE FROM cached_documents
    WHERE collection_name = ? AND document_id = ?
  `).run(collectionName, documentId)
  return (result.changes ?? 0) > 0
}

// ---------------------------------------------------------------------------
// Sync outbox — queue writes that need to be uploaded to Firebase
// ---------------------------------------------------------------------------

export interface OutboxEntry {
  id: string
  entity_type: string
  entity_id: string
  operation: 'set' | 'delete'
  payload_json: string
  status: 'pending' | 'synced' | 'failed'
  attempts: number
  created_at: number
  updated_at: number
  synced_at: number | null
}

/** Enqueue a document write for Firebase upload */
export function enqueueOutbox(
  entityType: string,
  entityId: string,
  operation: 'set' | 'delete',
  payload: unknown
): void {
  const database = openDatabase()
  const now = Date.now()
  const id = `${entityType}:${entityId}:${now}`
  database.prepare(`
    INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      operation = excluded.operation,
      payload_json = excluded.payload_json,
      status = 'pending',
      updated_at = excluded.updated_at
  `).run(id, entityType, entityId, operation, JSON.stringify(payload), now, now)
}

/** Read all pending outbox entries */
export function readPendingOutbox(): OutboxEntry[] {
  const database = openDatabase()
  return database.prepare(`
    SELECT * FROM sync_outbox
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 200
  `).all() as OutboxEntry[]
}

/** Mark outbox entries as synced */
export function markOutboxSynced(ids: string[]): void {
  if (!ids.length) return
  const database = openDatabase()
  const now = Date.now()
  const placeholders = ids.map(() => '?').join(',')
  database.prepare(`
    UPDATE sync_outbox
    SET status = 'synced', synced_at = ?, updated_at = ?
    WHERE id IN (${placeholders})
  `).run(now, now, ...ids)
}

/** Mark outbox entries as failed and increment attempts */
export function markOutboxFailed(ids: string[]): void {
  if (!ids.length) return
  const database = openDatabase()
  const now = Date.now()
  const placeholders = ids.map(() => '?').join(',')
  database.prepare(`
    UPDATE sync_outbox
    SET status = 'failed', attempts = attempts + 1, updated_at = ?
    WHERE id IN (${placeholders})
  `).run(now, ...ids)
}

/** Reset failed entries back to pending for retry */
export function resetFailedOutbox(): void {
  const database = openDatabase()
  const now = Date.now()
  database.prepare(`
    UPDATE sync_outbox
    SET status = 'pending', updated_at = ?
    WHERE status = 'failed' AND attempts < 10
  `).run(now)
}

/** Count pending outbox entries */
export function countPendingOutbox(): number {
  const database = openDatabase()
  const row = database.prepare(
    "SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'"
  ).get() as { count?: number } | undefined
  return Number(row?.count ?? 0)
}

/**
 * DEV ONLY — wipe all cached_documents and sync_outbox rows.
 * Leaves the schema intact so the app can restart cleanly.
 * Also closes the DB connection so the renderer sees a fresh state.
 */
export function resetDatabase(): { ok: boolean; error?: string } {
  try {
    const database = openDatabase()
    database.exec('DELETE FROM cached_documents;')
    database.exec('DELETE FROM sync_outbox;')
    database.exec('DELETE FROM meta;')
    // Close the connection so next open re-initialises cleanly
    db = null
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
