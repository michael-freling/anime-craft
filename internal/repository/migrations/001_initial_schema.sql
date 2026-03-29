CREATE TABLE IF NOT EXISTS reference_images (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    exercise_mode TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'beginner',
    tags TEXT DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    reference_image_id TEXT NOT NULL,
    exercise_mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    duration_seconds INTEGER,
    FOREIGN KEY (reference_image_id) REFERENCES reference_images(id)
);

CREATE TABLE IF NOT EXISTS drawings (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    overall_score INTEGER NOT NULL,
    proportions_score INTEGER,
    line_quality_score INTEGER,
    color_accuracy_score INTEGER,
    summary TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    strengths TEXT DEFAULT '[]',
    improvements TEXT DEFAULT '[]',
    raw_response TEXT DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT DEFAULT '',
    criteria_type TEXT NOT NULL,
    criteria_value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_achievements (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (achievement_id) REFERENCES achievements(id),
    UNIQUE(achievement_id)
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ai_api_key TEXT DEFAULT '',
    ai_provider TEXT NOT NULL DEFAULT 'openai',
    brush_default_size INTEGER NOT NULL DEFAULT 5,
    theme TEXT NOT NULL DEFAULT 'light',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_reference_image_id ON sessions(reference_image_id);
CREATE INDEX IF NOT EXISTS idx_session_achievements_achievement_id ON session_achievements(achievement_id);

-- Insert default settings row
INSERT OR IGNORE INTO settings (id) VALUES (1);
