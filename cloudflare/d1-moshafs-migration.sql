CREATE TABLE IF NOT EXISTS moshafs (
  id TEXT PRIMARY KEY,
  reciter_id TEXT NOT NULL REFERENCES reciters(id),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  rewaya TEXT,
  quality_kbps INTEGER CHECK (quality_kbps IS NULL OR quality_kbps > 0),
  source_name TEXT NOT NULL DEFAULT 'internal',
  source_id TEXT REFERENCES content_sources(id),
  original_server_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS moshafs_reciter_idx ON moshafs(reciter_id, is_active);

ALTER TABLE media_assets ADD COLUMN moshaf_id TEXT REFERENCES moshafs(id);
ALTER TABLE media_assets ADD COLUMN original_url TEXT;
ALTER TABLE media_assets ADD COLUMN bitrate_kbps INTEGER CHECK (bitrate_kbps IS NULL OR bitrate_kbps > 0);

INSERT OR IGNORE INTO moshafs (
  id, reciter_id, slug, name, rewaya, source_name, source_id, is_active, created_at, updated_at
) VALUES (
  'aaqib-azeez-mujawwad', 'aaqib-azeez', 'mujawwad', 'مجوّد', 'حفص عن عاصم',
  'Wikimedia Commons', 'wikimedia-aaqib-fatiha-cc-by-sa-4', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

UPDATE media_assets
SET moshaf_id = 'aaqib-azeez-mujawwad',
    original_url = 'https://commons.wikimedia.org/wiki/File:Chapter_1,_Al-Fatiha_(Mujawwad)_-_Recitation_of_the_Holy_Qur%27an.mp3'
WHERE id = 'aaqib-azeez-fatiha-mujawwad-v1';

DROP INDEX IF EXISTS media_assets_surah_active_unique;
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_moshaf_surah_active_unique
ON media_assets(moshaf_id, surah_number)
WHERE kind = 'quran_surah' AND status <> 'archived';

CREATE INDEX IF NOT EXISTS media_assets_moshaf_idx ON media_assets(moshaf_id, surah_number);
