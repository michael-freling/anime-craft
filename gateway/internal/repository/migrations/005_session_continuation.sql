-- Carrying on from a submitted drawing opens a new session holding the same
-- artwork, and the saved drawing moves with it. This records that hand-off so
-- the chain can be followed forward: a link from a submitted session to the
-- one that took its drawing on.
ALTER TABLE sessions ADD COLUMN continued_by_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_continued_by ON sessions(continued_by_session_id);
