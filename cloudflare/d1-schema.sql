PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reciters (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  source_name TEXT NOT NULL DEFAULT 'internal',
  source_reciter_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surahs (
  number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 114),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  ayah_count INTEGER NOT NULL CHECK (ayah_count > 0),
  revelation_type TEXT CHECK (revelation_type IN ('meccan', 'medinan')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('quran_surah', 'radio_program', 'lecture', 'recording', 'jingle')),
  logical_key TEXT NOT NULL UNIQUE,
  reciter_id TEXT REFERENCES reciters(id),
  surah_number INTEGER REFERENCES surahs(number),
  title TEXT NOT NULL,
  description TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  is_downloadable INTEGER NOT NULL DEFAULT 1 CHECK (is_downloadable IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  current_version_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((kind = 'quran_surah' AND reciter_id IS NOT NULL AND surah_number IS NOT NULL) OR kind <> 'quran_surah')
);

CREATE UNIQUE INDEX IF NOT EXISTS media_assets_surah_active_unique
ON media_assets(reciter_id, surah_number)
WHERE kind = 'quran_surah' AND status <> 'archived';

CREATE INDEX IF NOT EXISTS media_assets_kind_status_idx ON media_assets(kind, status);
CREATE INDEX IF NOT EXISTS media_assets_reciter_idx ON media_assets(reciter_id, surah_number);

CREATE TABLE IF NOT EXISTS media_versions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES media_assets(id),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  r2_bucket TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  sha256 TEXT NOT NULL,
  etag TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  state TEXT NOT NULL DEFAULT 'uploading' CHECK (state IN ('uploading', 'ready', 'superseded', 'failed')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  UNIQUE(asset_id, version_number)
);

CREATE INDEX IF NOT EXISTS media_versions_asset_state_idx ON media_versions(asset_id, state);

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  artwork_asset_id TEXT REFERENCES media_assets(id),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedule_entries (
  id TEXT PRIMARY KEY,
  program_id TEXT REFERENCES programs(id),
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS schedule_entries_window_idx ON schedule_entries(starts_at, ends_at, status);

CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES media_assets(id),
  version_id TEXT NOT NULL REFERENCES media_versions(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  expected_sha256 TEXT NOT NULL,
  expected_bytes INTEGER NOT NULL CHECK (expected_bytes >= 0),
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'uploaded', 'verified', 'expired', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
