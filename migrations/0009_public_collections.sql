PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN public_handle TEXT;
ALTER TABLE users ADD COLUMN collection_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN profile_bio TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_handle
ON users(public_handle)
WHERE public_handle IS NOT NULL;
