package repository

import (
	"database/sql"
	"fmt"

	"github.com/michael-freling/anime-craft/gateway/internal/model"
)

type DrawingDocumentRepository struct {
	db *DB
}

func NewDrawingDocumentRepository(db *DB) *DrawingDocumentRepository {
	return &DrawingDocumentRepository{db: db}
}

// Upsert records the latest autosave for a session. Autosave runs while the
// artist draws, so this is an insert-or-update rather than a create.
func (r *DrawingDocumentRepository) Upsert(doc model.DrawingDocument) error {
	_, err := r.db.Exec(
		`INSERT INTO drawing_documents (session_id, file_path, revision, operation_count, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(session_id) DO UPDATE SET
		     file_path = excluded.file_path,
		     revision = excluded.revision,
		     operation_count = excluded.operation_count,
		     updated_at = excluded.updated_at`,
		doc.SessionID, doc.FilePath, doc.Revision, doc.OperationCount, doc.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert drawing document: %w", err)
	}
	return nil
}

func (r *DrawingDocumentRepository) Get(sessionID string) (model.DrawingDocument, error) {
	var doc model.DrawingDocument
	err := r.db.QueryRow(
		`SELECT session_id, file_path, revision, operation_count, updated_at
		 FROM drawing_documents WHERE session_id = ?`,
		sessionID,
	).Scan(&doc.SessionID, &doc.FilePath, &doc.Revision, &doc.OperationCount, &doc.UpdatedAt)
	if err == sql.ErrNoRows {
		return model.DrawingDocument{}, fmt.Errorf("drawing document not found for session: %s", sessionID)
	}
	if err != nil {
		return model.DrawingDocument{}, fmt.Errorf("get drawing document: %w", err)
	}
	return doc, nil
}

func (r *DrawingDocumentRepository) Delete(sessionID string) error {
	if _, err := r.db.Exec(`DELETE FROM drawing_documents WHERE session_id = ?`, sessionID); err != nil {
		return fmt.Errorf("delete drawing document: %w", err)
	}
	return nil
}
