package bff

import (
	"errors"
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeReferenceWindows stands in for the windowing toolkit, which is exactly
// what the interface exists to keep out of these tests.
type fakeReferenceWindows struct {
	openCalls  int
	closeCalls int
	openedID   string
	openedName string
	open       bool
	openErr    error
	closeErr   error
}

func (f *fakeReferenceWindows) Open(referenceID string, title string) error {
	f.openCalls++
	if f.openErr != nil {
		return f.openErr
	}
	f.openedID = referenceID
	f.openedName = title
	f.open = true
	return nil
}

func (f *fakeReferenceWindows) Close() error {
	f.closeCalls++
	if f.closeErr != nil {
		return f.closeErr
	}
	f.open = false
	return nil
}

func (f *fakeReferenceWindows) IsOpen() bool { return f.open }

func referenceWindowFixture(t *testing.T) (*ReferenceWindowService, *fakeReferenceWindows) {
	t.Helper()
	db := testDB(t)
	refRepo := repository.NewReferenceRepository(db)
	require.NoError(t, refRepo.Create(model.ReferenceImage{
		ID: "ref-700", Title: "Simple Face", FilePath: "references/ref-700.png",
		ExerciseMode: "line_work", Difficulty: "beginner", CreatedAt: time.Now(),
	}))

	windows := &fakeReferenceWindows{}
	return NewReferenceWindowService(windows, refRepo), windows
}

// The window may end up on another screen with nothing else to say what it is,
// so it is titled after the reference rather than generically.
func TestReferenceWindowService_TitlesTheWindowAfterTheReference(t *testing.T) {
	svc, windows := referenceWindowFixture(t)

	require.NoError(t, svc.OpenReferenceWindow("ref-700"))

	assert.Equal(t, "ref-700", windows.openedID)
	assert.Equal(t, "Simple Face", windows.openedName)
	assert.True(t, svc.IsReferenceWindowOpen())
}

// A reference with no title, or one that has gone missing, is still worth
// showing — the window just falls back to a plain name.
func TestReferenceWindowService_OpensWithoutATitle(t *testing.T) {
	svc, windows := referenceWindowFixture(t)

	require.NoError(t, svc.OpenReferenceWindow("ref-does-not-exist"))

	assert.Equal(t, "Reference", windows.openedName)
	assert.Equal(t, "ref-does-not-exist", windows.openedID)
}

func TestReferenceWindowService_ReportsAFailureToOpen(t *testing.T) {
	svc, windows := referenceWindowFixture(t)
	windows.openErr = errors.New("no display")

	err := svc.OpenReferenceWindow("ref-700")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "open reference window")
	assert.False(t, svc.IsReferenceWindowOpen())
}

// Closing a window that is not open is the state the caller asked for, not a
// failure — the editor closes it on leaving a session without checking.
func TestReferenceWindowService_ClosingWhenNothingIsOpen(t *testing.T) {
	svc, windows := referenceWindowFixture(t)

	require.NoError(t, svc.CloseReferenceWindow())

	assert.Equal(t, 1, windows.closeCalls)
	assert.False(t, svc.IsReferenceWindowOpen())
}

func TestReferenceWindowService_OpenThenClose(t *testing.T) {
	svc, _ := referenceWindowFixture(t)

	require.NoError(t, svc.OpenReferenceWindow("ref-700"))
	assert.True(t, svc.IsReferenceWindowOpen())

	require.NoError(t, svc.CloseReferenceWindow())
	assert.False(t, svc.IsReferenceWindowOpen())
}

// A build with no windowing toolkit says so rather than pretending, and still
// lets the editor ask about and close what it does not have.
func TestReferenceWindowService_WithoutAToolkit(t *testing.T) {
	svc := NewReferenceWindowService(nil, nil)

	err := svc.OpenReferenceWindow("ref-700")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "cannot open a second window")
	assert.False(t, svc.IsReferenceWindowOpen())
	assert.NoError(t, svc.CloseReferenceWindow())
}
