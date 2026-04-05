package repository

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewMemoryDB(t *testing.T) {
	db, err := NewMemoryDB()
	require.NoError(t, err)
	assert.NotNil(t, db)
	t.Cleanup(func() { _ = db.Close() })

	// Verify foreign keys are enabled
	var fkEnabled int
	err = db.QueryRow("PRAGMA foreign_keys").Scan(&fkEnabled)
	require.NoError(t, err)
	assert.Equal(t, 1, fkEnabled)
}

func TestNewDB_InvalidPath(t *testing.T) {
	// Open a database at a path that should fail
	_, err := NewDB("/nonexistent/deeply/nested/path/db.sqlite")
	require.Error(t, err)
}

func TestRunMigrations_Idempotent(t *testing.T) {
	db := testDB(t) // already ran migrations once

	// Running migrations again should be a no-op (idempotent)
	err := db.RunMigrations()
	require.NoError(t, err)
}

func TestRunMigrations_DBClosed(t *testing.T) {
	db := testDB(t)
	require.NoError(t, db.Close())

	// RunMigrations should fail when DB is closed
	err := RunMigrations(db.DB)
	require.Error(t, err)
}

func TestNewDB_Valid(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := tmpDir + "/test.db"

	db, err := NewDB(dbPath)
	require.NoError(t, err)
	require.NotNil(t, db)
	t.Cleanup(func() { _ = db.Close() })

	// Verify WAL mode is enabled
	var journalMode string
	err = db.QueryRow("PRAGMA journal_mode").Scan(&journalMode)
	require.NoError(t, err)
	assert.Equal(t, "wal", journalMode)

	// Verify foreign keys are enabled
	var fkEnabled int
	err = db.QueryRow("PRAGMA foreign_keys").Scan(&fkEnabled)
	require.NoError(t, err)
	assert.Equal(t, 1, fkEnabled)
}

func TestDB_RunMigrationsMethod(t *testing.T) {
	db, err := NewMemoryDB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	// Use the method wrapper
	err = db.RunMigrations()
	require.NoError(t, err)

	// Verify the migrations created the tables
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM reference_images").Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 2, count) // seed data has 2 references
}
