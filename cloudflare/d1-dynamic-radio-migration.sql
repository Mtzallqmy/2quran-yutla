PRAGMA foreign_keys = ON;

ALTER TABLE reciters ADD COLUMN image_storage_key TEXT;
ALTER TABLE reciters ADD COLUMN description TEXT;
ALTER TABLE reciters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reciters ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('draft', 'published', 'hidden', 'archived'));

ALTER TABLE moshafs ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE moshafs ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('draft', 'published', 'hidden', 'archived'));

ALTER TABLE media_assets ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('draft', 'published', 'hidden', 'archived'));
ALTER TABLE media_assets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media_assets ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS reciters_public_idx ON reciters(is_active, publication_status, sort_order, name_ar);
CREATE INDEX IF NOT EXISTS moshafs_public_idx ON moshafs(reciter_id, is_active, publication_status, sort_order);
CREATE INDEX IF NOT EXISTS media_assets_public_idx ON media_assets(kind, status, publication_status, sort_order, updated_at);

CREATE TABLE IF NOT EXISTS radio_stations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  artwork_storage_key TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  rotation_anchor_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden', 'archived')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  content_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS radio_playlist_items (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES radio_stations(id),
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(station_id, media_asset_id)
);

CREATE INDEX IF NOT EXISTS radio_stations_public_idx ON radio_stations(status, is_active, updated_at);
CREATE INDEX IF NOT EXISTS radio_playlist_station_idx ON radio_playlist_items(station_id, is_active, sort_order);

UPDATE media_assets
SET duration_ms = CASE id
  WHEN 'al-minshawi-murattal-001' THEN 51984
  WHEN 'al-minshawi-murattal-002' THEN 8216581
  WHEN 'al-minshawi-murattal-003' THEN 5207301
  ELSE duration_ms
END,
updated_at = CURRENT_TIMESTAMP
WHERE id IN ('al-minshawi-murattal-001', 'al-minshawi-murattal-002', 'al-minshawi-murattal-003');

INSERT OR IGNORE INTO radio_stations (id, title, description, timezone, rotation_anchor_at, status, is_active, content_version, created_at, updated_at)
VALUES ('quran-yutla-radio', 'إذاعة قرآن يتلى', 'بث مجدول من تلاوات مرخصة ومفهرسة في مكتبة التطبيق.', 'UTC', '2026-08-22T00:00:00.000Z', 'published', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO radio_playlist_items (id, station_id, media_asset_id, sort_order, is_active, created_at, updated_at) VALUES
  ('quran-yutla-radio-001', 'quran-yutla-radio', 'al-minshawi-murattal-001', 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('quran-yutla-radio-002', 'quran-yutla-radio', 'al-minshawi-murattal-002', 20, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('quran-yutla-radio-003', 'quran-yutla-radio', 'al-minshawi-murattal-003', 30, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
