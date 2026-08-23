INSERT OR IGNORE INTO achievements (id, name, title, description, icon, criteria_type, criteria_value) VALUES
('ach-001', 'first_session', 'First Steps', 'Complete your first practice session', 'star', 'session_count', 1),
('ach-002', 'getting_started', 'Getting Started', 'Complete 5 practice sessions', 'pencil', 'session_count', 5),
('ach-003', 'dedicated_artist', 'Dedicated Artist', 'Complete 25 practice sessions', 'palette', 'session_count', 25),
('ach-004', 'perfectionist', 'Perfectionist', 'Score 90 or above on a session', 'trophy', 'score_threshold', 90),
('ach-005', 'line_master', 'Line Master', 'Complete 10 line work sessions', 'brush', 'mode_session_count', 10),
('ach-007', 'on_a_roll', 'On a Roll', 'Practice 3 days in a row', 'fire', 'streak', 3),
('ach-008', 'week_warrior', 'Week Warrior', 'Practice 7 days in a row', 'calendar', 'streak', 7),
('ach-009', 'improving', 'Improving', 'Improve your average score by 10 points', 'chart', 'score_improvement', 10);

INSERT OR IGNORE INTO reference_images (id, title, file_path, exercise_mode, difficulty, tags) VALUES
('ref-001', 'Simple Face - Lines', 'references/line_work/simple-face.png', 'line_work', 'beginner', 'face,portrait'),
('ref-002', 'Chibi Character - Lines', 'references/line_work/chibi-character.png', 'line_work', 'beginner', 'character,chibi');
