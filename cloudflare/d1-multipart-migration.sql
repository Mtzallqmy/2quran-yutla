ALTER TABLE upload_sessions ADD COLUMN r2_key TEXT;
ALTER TABLE upload_sessions ADD COLUMN r2_upload_id TEXT;
ALTER TABLE upload_sessions ADD COLUMN content_type TEXT;

CREATE TABLE IF NOT EXISTS upload_parts (
  session_id TEXT NOT NULL REFERENCES upload_sessions(id),
  part_number INTEGER NOT NULL CHECK (part_number > 0),
  etag TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  sha256 TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, part_number)
);
