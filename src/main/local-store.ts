import { app } from 'electron'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

type DatabaseSync = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    get: (...params: unknown[]) => unknown
    all: (...params: unknown[]) => unknown[]
    run: (...params: unknown[]) => unknown
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
