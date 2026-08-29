-- Tracks the autosaved, resumable drawing document for a session. The drawing
-- itself lives on disk (a journal of vector operations plus an OpenRaster
-- checkpoint); this table is the index the home screen reads to offer a
-- session for resuming without touching the filesystem.
CREATE TABLE IF NOT EXISTS drawing_documents (
    session_id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    operation_count INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_drawing_documents_updated_at ON drawing_documents(updated_at);
