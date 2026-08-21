PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reciter_image_versions (
  id TEXT PRIMARY KEY,
  reciter_id TEXT NOT NULL REFERENCES reciters(id),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  sha256 TEXT NOT NULL,
  original_url TEXT NOT NULL,
  attribution_snapshot TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(reciter_id, version_number)
);

CREATE INDEX IF NOT EXISTS reciter_images_reciter_idx ON reciter_image_versions(reciter_id, version_number DESC);
