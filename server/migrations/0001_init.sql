-- The shared tree's versions. Each version's data is a file in R2 (`key`), as a large tree with photo thumbnails
-- can pass D1's row size limit; this table is the list, and the lock: a version number can only be taken once.
CREATE TABLE tree_versions (
	version INTEGER PRIMARY KEY,
	key TEXT NOT NULL,
	saved_at TEXT NOT NULL,
	saved_by TEXT NOT NULL,
	size INTEGER NOT NULL
);

-- Who may use the family edition (F4). Never part of the tree data, backups or the code.
CREATE TABLE users (
	email TEXT PRIMARY KEY,
	role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
	name TEXT,
	invited_by TEXT,
	added_at TEXT NOT NULL
);
