-- Signed-in sessions (F4). The cookie holds a random token; only its SHA-256 is stored, so the table is no use to
-- anyone who reads it. Removing someone from `users` locks them out at once (every request checks the list);
-- deleting their sessions signs them out too.
CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	email TEXT NOT NULL,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL
);
CREATE INDEX sessions_by_email ON sessions (email);
