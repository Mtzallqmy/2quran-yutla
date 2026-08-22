PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS live_hls_channels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  source_id TEXT NOT NULL REFERENCES content_sources(id),
  hls_manifest_url TEXT NOT NULL UNIQUE,
  artwork_storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden', 'archived')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  content_version INTEGER NOT NULL DEFAULT 1,
  last_probe_status TEXT NOT NULL DEFAULT 'unverified' CHECK (last_probe_status IN ('unverified', 'online', 'offline', 'invalid')),
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS live_hls_channels_public_idx ON live_hls_channels(status, is_active, sort_order, updated_at);
