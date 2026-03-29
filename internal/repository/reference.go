package repository

import "github.com/michael-freling/anime-craft/internal/model"

type ReferenceRepository struct {
	db *DB
}

func NewReferenceRepository(db *DB) *ReferenceRepository {
	return &ReferenceRepository{db: db}
}

func (r *ReferenceRepository) List(mode string) ([]model.ReferenceImage, error) {
	rows, err := r.db.Query(
		`SELECT id, title, file_path, exercise_mode, difficulty, tags, created_at
		 FROM reference_images
		 WHERE (? = '' OR exercise_mode = ?)
		 ORDER BY title`,
		mode, mode,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var images []model.ReferenceImage
	for rows.Next() {
		var img model.ReferenceImage
		if err := rows.Scan(&img.ID, &img.Title, &img.FilePath, &img.ExerciseMode, &img.Difficulty, &img.Tags, &img.CreatedAt); err != nil {
			return nil, err
		}
		images = append(images, img)
	}
	return images, rows.Err()
}

func (r *ReferenceRepository) Get(id string) (model.ReferenceImage, error) {
	var img model.ReferenceImage
	err := r.db.QueryRow(
		`SELECT id, title, file_path, exercise_mode, difficulty, tags, created_at
		 FROM reference_images WHERE id = ?`,
		id,
	).Scan(&img.ID, &img.Title, &img.FilePath, &img.ExerciseMode, &img.Difficulty, &img.Tags, &img.CreatedAt)
	return img, err
}
