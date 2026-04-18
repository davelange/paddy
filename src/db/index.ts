import { Database } from "bun:sqlite";

const db = new Database("paddy.db", { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
	CREATE TABLE IF NOT EXISTS credentials (
		id              TEXT PRIMARY KEY,
		user_id			TEXT NOT NULL UNIQUE,
		public_key      BLOB NOT NULL,
		counter         INTEGER NOT NULL,
		label           TEXT NOT NULL,
		status          TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
		created_at      INTEGER NOT NULL,
		approved_at     INTEGER,
		last_used_at    INTEGER
	);
`);

db.exec(`
	CREATE TABLE IF NOT EXISTS sessions (
		id              TEXT PRIMARY KEY,
		credential_pk   TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
		created_at      INTEGER NOT NULL,
		expires_at      INTEGER NOT NULL
	);
`);

export { db };
