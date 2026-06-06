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
