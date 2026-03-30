package repository

import (
	"fmt"

	"github.com/michael-freling/anime-craft/internal/model"
)

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
	defer func() { _ = rows.Close() }()

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

func (r *ReferenceRepository) Create(ref model.ReferenceImage) error {
	_, err := r.db.Exec(
		`INSERT INTO reference_images (id, title, file_path, exercise_mode, difficulty, tags, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		ref.ID, ref.Title, ref.FilePath, ref.ExerciseMode, ref.Difficulty, ref.Tags, ref.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert reference image: %w", err)
	}
	return nil
}

func (r *ReferenceRepository) Delete(id string) error {
	result, err := r.db.Exec(`DELETE FROM reference_images WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete reference image: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("reference image not found: %s", id)
	}
	return nil
}
