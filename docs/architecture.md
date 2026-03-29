# System Architecture: Anime Craft

## 1. Executive Summary

Anime Craft is a desktop application for beginner anime artists to practice drawing with AI-powered feedback. It is built with **Wails 3** -- a framework that compiles a Go backend and a web frontend into a single native desktop binary. The Go layer handles data persistence, business logic, and AI integration. The Next.js layer provides the drawing UI and session flow. Wails 3 auto-generates type-safe TypeScript bindings from Go service structs, so the frontend calls Go functions directly without REST endpoints or manual serialization.

The architecture prioritizes simplicity for an MVP: a single SQLite database for all local data, a thin Go service layer organized around domain concepts, and a straightforward Next.js app with minimal client-side state.

---

## 2. System Overview

### High-Level Architecture

```
+------------------------------------------------------------------+
|                        Wails 3 Desktop App                       |
|                                                                  |
|  +---------------------------+  +-----------------------------+  |
|  |     Next.js Frontend      |  |        Go Backend           |  |
|  |                           |  |                             |  |
|  |  +---------------------+  |  |  +----------------------+   |  |
|  |  | Pages / Components  |  |  |  | SessionService       |   |  |
|  |  | - Home              |  |  |  | DrawingService       |   |  |
|  |  | - Session (Drawing) |  |  |  | FeedbackService      |   |  |
|  |  | - Feedback Review   |  |  |  | ProgressService      |   |  |
|  |  | - Progress / Stats  |  |  |  | ReferenceService     |   |  |
|  |  +---------------------+  |  |  +----------+-----------+   |  |
|  |            |               |  |             |               |  |
|  |  +---------------------+  |  |  +----------+-----------+   |  |
|  |  | Drawing Canvas      |  |  |  | Repository Layer     |   |  |
|  |  | (HTML5 Canvas)      |  |  |  | (SQLite via sqlc)    |   |  |
|  |  +---------------------+  |  |  +----------------------+   |  |
|  |            |               |  |             |               |  |
|  +------------|---------------+  +-------------|---------------+  |
|               |    Wails Bindings (auto-gen)   |                 |
|               +--------------------------------+                 |
|                                                                  |
+------------------------------------------------------------------+
                               |
                               | HTTPS (outbound only)
                               v
                    +---------------------+
                    | AI Feedback API     |
                    | (OpenAI / Claude    |
                    |  Vision endpoint)   |
                    +---------------------+
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop framework | Wails 3 | Single binary, Go backend, web frontend, no Electron overhead |
| Frontend framework | Next.js (static export) | Familiar to the developer; component model fits the UI needs |
| Database | SQLite | Local-first desktop app; no server; simple, zero-config |
| SQL access | sqlc | Type-safe Go code generated from SQL; minimal ORM overhead |
| Drawing surface | HTML5 Canvas API | Standard, performant, well-supported across all platforms |
| AI feedback | External vision API (OpenAI or Claude) | Multimodal models can compare reference and user drawings |
| State management | React Context + useReducer | Sufficient for session-scoped state; no Redux needed for MVP |

---

## 3. Frontend Architecture

### Next.js Configuration

Wails 3 serves the frontend from a compiled static bundle. Next.js must be configured for **static export** (`output: 'export'` in `next.config.js`). This means no server-side rendering, no API routes, and no dynamic server features. All data fetching goes through Wails bindings (generated TypeScript functions that call Go methods).

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Home screen. Start a new session, choose exercise mode (line work, coloring, full drawing), select a reference image. |
| `/session/[id]` | Active drawing session. Split view: reference image on one side, drawing canvas on the other. Timer and session controls. |
| `/session/[id]/feedback` | Feedback review. Displays AI-generated feedback: score, category breakdowns, specific suggestions, side-by-side comparison. |
| `/progress` | Progress dashboard. Session history list, score trends over time, achievements. |
| `/settings` | App settings. AI API key configuration, drawing preferences. |

### Component Hierarchy

```
App
 +-- Layout
      +-- Sidebar (navigation)
      +-- Page Content
           +-- HomePage
           |    +-- ExerciseModeSelector
           |    +-- ReferenceImagePicker
           |    +-- StartSessionButton
           |
           +-- SessionPage
           |    +-- ReferenceImageViewer
           |    +-- DrawingCanvas
           |    |    +-- ToolBar (brush, eraser, color picker, undo/redo)
           |    |    +-- CanvasLayer
           |    +-- SessionControls (timer, submit, discard)
           |
           +-- FeedbackPage
           |    +-- ScoreDisplay
           |    +-- CategoryBreakdown (proportions, line quality, color accuracy)
           |    +-- FeedbackComments
           |    +-- SideBySideComparison
           |    +-- NextSessionButton
           |
           +-- ProgressPage
                +-- SessionHistoryList
                +-- ScoreChart
                +-- AchievementsList
```

### State Management

Session-scoped state is managed with React Context and `useReducer`. There is one primary context:

- **SessionContext**: Holds the active session state -- current reference image, canvas data, timer state, exercise mode. Created when a session starts, destroyed when the user returns home.

Other data (session history, progress stats, achievements) is fetched on demand from Go services via Wails bindings and does not need global state. React Query (TanStack Query) can be used for caching and refetching this data, but is optional for MVP.

### Drawing Canvas

The drawing canvas uses the **HTML5 Canvas API** directly (or via a thin wrapper library such as `perfect-freehand` for pressure-sensitive stroke rendering). Key capabilities for MVP:

- Freehand drawing with configurable brush size and color
- Eraser tool
- Undo / redo (stroke-level history stack)
- Clear canvas
- Export canvas to PNG (for submission to AI feedback)

Canvas state (stroke history) lives in a local `useRef` and is not part of React state to avoid unnecessary re-renders during drawing.

---

## 4. Backend Architecture

### Service Layer

The Go backend is organized as a set of **Wails services** -- Go structs with exported methods that Wails automatically binds to the frontend. Each service is registered with the Wails application at startup.

```
internal/
  bff/
    session.go        -- SessionService
    drawing.go        -- DrawingService
    feedback.go       -- FeedbackService
    progress.go       -- ProgressService
    reference.go      -- ReferenceService
    settings.go       -- SettingsService
  repository/
    db.go             -- Database connection and migration
    session.go        -- Session queries
    drawing.go        -- Drawing queries
    feedback.go       -- Feedback queries
    achievement.go    -- Achievement queries
  ai/
    client.go         -- AI API client interface
    openai.go         -- OpenAI vision implementation
    prompt.go         -- Prompt templates for feedback generation
  model/
    types.go          -- Shared domain types
```

### BFF Definitions

**SessionService** -- Manages practice sessions.

- `StartSession(mode string, referenceID string) -> Session` -- Creates a new session record, returns session metadata.
- `EndSession(sessionID string) -> Session` -- Marks session as completed, records end time.
- `GetSession(sessionID string) -> Session` -- Retrieves a single session.
- `ListSessions(limit int, offset int) -> []Session` -- Retrieves session history with pagination.

**DrawingService** -- Handles saving and retrieving user drawings.

- `SaveDrawing(sessionID string, imageData []byte) -> Drawing` -- Saves the exported canvas PNG. Stores the image file on disk and metadata in SQLite.
- `GetDrawing(sessionID string) -> Drawing` -- Retrieves drawing metadata and file path for a session.

**FeedbackService** -- Orchestrates AI feedback.

- `RequestFeedback(sessionID string) -> Feedback` -- Sends the user drawing and reference image to the AI API, parses the response, stores feedback, and returns it.
- `GetFeedback(sessionID string) -> Feedback` -- Retrieves stored feedback for a session.

**ProgressService** -- Aggregates user progress and gamification.

- `GetProgressSummary() -> ProgressSummary` -- Returns overall stats: total sessions, average score, score trend.
- `GetAchievements() -> []Achievement` -- Returns earned and available achievements.
- `CheckAndAwardAchievements(sessionID string) -> []Achievement` -- Evaluates achievement criteria after a session; awards any newly earned achievements.

**ReferenceService** -- Manages reference images.

- `ListReferences(mode string) -> []ReferenceImage` -- Lists available reference images filtered by exercise mode.
- `GetReference(referenceID string) -> ReferenceImage` -- Retrieves a single reference image with its metadata.

**SettingsService** -- Manages application settings.

- `GetSettings() -> Settings` -- Retrieves current settings.
- `UpdateSettings(settings Settings) -> Settings` -- Updates settings (e.g., AI API key).

### Wails 3 Service Registration

In `main.go`, services are instantiated and registered:

```
app := application.New(application.Options{
    Name: "Anime Craft",
    Services: []application.Service{
        application.NewService(sessionService),
        application.NewService(drawingService),
        application.NewService(feedbackService),
        application.NewService(progressService),
        application.NewService(referenceService),
        application.NewService(settingsService),
    },
    // ...
})
```

Wails 3 analyzes these structs at build time and generates TypeScript bindings in `frontend/bindings/`. The frontend imports and calls them as regular async functions:

```
import { SessionService } from '../bindings/animecraft';

const session = await SessionService.StartSession("line_work", referenceId);
```

### File Storage

User drawings and reference images are stored as files on disk in the app's data directory. SQLite stores metadata (file paths, timestamps, associations). The data directory follows OS conventions:

- **Linux**: `~/.local/share/anime-craft/`
- **macOS**: `~/Library/Application Support/anime-craft/`
- **Windows**: `%APPDATA%/anime-craft/`

Directory structure within the data directory:

```
anime-craft/
  anime-craft.db          -- SQLite database
  drawings/               -- User drawing PNGs, named by session ID
  references/             -- Reference image files
```

---

## 5. Data Model

### Entity-Relationship Diagram

```
[reference_images] 1---* [sessions] 1---1 [drawings]
                                    1---1 [feedback]
                                    *---* [session_achievements]
                         [achievements] 1---* [session_achievements]
                         [settings]  (singleton, 1 row)
```

### Table: reference_images

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| title | TEXT | NOT NULL | Display name of the reference |
| file_path | TEXT | NOT NULL | Relative path to image file |
| exercise_mode | TEXT | NOT NULL | "line_work", "coloring", or "full_drawing" |
| difficulty | TEXT | NOT NULL | "beginner", "intermediate", "advanced" |
| tags | TEXT | | Comma-separated tags (e.g., "eyes,face,portrait") |
| created_at | DATETIME | NOT NULL | When the reference was added |

### Table: sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| reference_image_id | TEXT | FK -> reference_images.id, NOT NULL | The reference used |
| exercise_mode | TEXT | NOT NULL | "line_work", "coloring", "full_drawing" |
| status | TEXT | NOT NULL | "in_progress", "completed", "discarded" |
| started_at | DATETIME | NOT NULL | When the session began |
| ended_at | DATETIME | | When the session ended |
| duration_seconds | INTEGER | | Total drawing time in seconds |

### Table: drawings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| session_id | TEXT | FK -> sessions.id, UNIQUE, NOT NULL | One drawing per session |
| file_path | TEXT | NOT NULL | Relative path to the saved PNG |
| created_at | DATETIME | NOT NULL | When the drawing was saved |

### Table: feedback

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| session_id | TEXT | FK -> sessions.id, UNIQUE, NOT NULL | One feedback per session |
| overall_score | INTEGER | NOT NULL | 0-100 overall score |
| proportions_score | INTEGER | | 0-100 score for proportions |
| line_quality_score | INTEGER | | 0-100 score for line quality |
| color_accuracy_score | INTEGER | | 0-100 score for color accuracy |
| summary | TEXT | NOT NULL | Short overall feedback message |
| details | TEXT | NOT NULL | Detailed feedback in markdown |
| strengths | TEXT | | JSON array of things done well |
| improvements | TEXT | | JSON array of areas to improve |
| raw_response | TEXT | | Full AI API response for debugging |
| created_at | DATETIME | NOT NULL | When feedback was generated |

### Table: achievements

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL, UNIQUE | Machine-readable name (e.g., "first_session") |
| title | TEXT | NOT NULL | Display title (e.g., "First Steps") |
| description | TEXT | NOT NULL | What the user did to earn it |
| icon | TEXT | | Icon identifier or emoji |
| criteria_type | TEXT | NOT NULL | "session_count", "score_threshold", "streak", etc. |
| criteria_value | INTEGER | NOT NULL | Threshold value for the criteria |

### Table: session_achievements

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| session_id | TEXT | FK -> sessions.id, NOT NULL | Session that triggered the achievement |
| achievement_id | TEXT | FK -> achievements.id, NOT NULL | The earned achievement |
| earned_at | DATETIME | NOT NULL | When it was earned |

**Unique constraint**: (achievement_id) -- each achievement can only be earned once.

### Table: settings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Always 1 (singleton row) |
| ai_api_key | TEXT | | Encrypted API key for AI service |
| ai_provider | TEXT | NOT NULL DEFAULT 'openai' | "openai" or "anthropic" |
| brush_default_size | INTEGER | NOT NULL DEFAULT 5 | Default brush size |
| theme | TEXT | NOT NULL DEFAULT 'light' | "light" or "dark" |
| updated_at | DATETIME | NOT NULL | Last update timestamp |

### Indexes

- `idx_sessions_status` on sessions(status) -- Filter active/completed sessions
- `idx_sessions_started_at` on sessions(started_at) -- Sort session history
- `idx_sessions_reference_image_id` on sessions(reference_image_id) -- Look up sessions for a reference
- `idx_feedback_session_id` on feedback(session_id) -- Look up feedback for a session (already UNIQUE)
- `idx_session_achievements_achievement_id` on session_achievements(achievement_id) -- Look up when an achievement was earned

### Migration Approach

Migrations are managed as numbered SQL files in `internal/repository/migrations/` and applied at application startup using Go's `embed` package and a simple migration runner. For MVP, migrations run automatically -- no separate migration tool is needed.

```
internal/repository/migrations/
  001_initial_schema.sql
  002_seed_achievements.sql
  003_seed_reference_images.sql
```

---

## 6. API Design (Wails Bindings)

Since Anime Craft is a desktop app using Wails 3, there are no REST endpoints. Instead, Go service methods are directly callable from the frontend via auto-generated TypeScript bindings. Below are the key bindings organized by service.

### SessionService

#### StartSession

**Go signature**: `StartSession(mode string, referenceID string) (Session, error)`

**Description**: Creates a new practice session.

**Parameters**:
- `mode` -- Exercise type: `"line_work"`, `"coloring"`, or `"full_drawing"`
- `referenceID` -- UUID of the selected reference image

**Returns**: Session object with id, status "in_progress", and timestamps.

**Errors**:
- Invalid mode value
- Reference image not found

#### EndSession

**Go signature**: `EndSession(sessionID string) (Session, error)`

**Description**: Marks a session as completed, records the end time and duration.

**Parameters**:
- `sessionID` -- UUID of the session to end

**Returns**: Updated Session object.

**Errors**:
- Session not found
- Session already ended

#### ListSessions

**Go signature**: `ListSessions(limit int, offset int) ([]SessionSummary, error)`

**Description**: Returns paginated session history, most recent first.

**Returns**: Array of session summaries including reference image thumbnail, score, and date.

### DrawingService

#### SaveDrawing

**Go signature**: `SaveDrawing(sessionID string, imageData []byte) (Drawing, error)`

**Description**: Saves the canvas export as a PNG file. Called when the user submits their drawing.

**Parameters**:
- `sessionID` -- UUID of the active session
- `imageData` -- Raw PNG bytes from canvas `toDataURL()` export

**Returns**: Drawing metadata with file path.

**Errors**:
- Session not found or not in progress
- Image data empty or corrupted

### FeedbackService

#### RequestFeedback

**Go signature**: `RequestFeedback(sessionID string) (Feedback, error)`

**Description**: Orchestrates the full feedback flow -- retrieves the drawing and reference image, sends them to the AI API, parses the structured response, stores the feedback, evaluates achievements, and returns the result.

This is the most important binding in the application. It coordinates:
1. Load the user drawing and reference image for the session
2. Build the AI prompt with both images
3. Call the AI vision API
4. Parse the structured feedback response (scores, summary, details)
5. Store feedback in the database
6. Trigger achievement evaluation via ProgressService
7. Return the complete feedback to the frontend

**Returns**: Feedback object with scores, text feedback, and any newly earned achievements.

**Errors**:
- Session not found
- Drawing not found for session
- AI API key not configured
- AI API call failed (network error, rate limit, etc.)
- AI response could not be parsed

#### GetFeedback

**Go signature**: `GetFeedback(sessionID string) (Feedback, error)`

**Description**: Retrieves previously generated feedback for a session.

### ProgressService

#### GetProgressSummary

**Go signature**: `GetProgressSummary() (ProgressSummary, error)`

**Description**: Returns aggregated stats.

**Returns**:
```
ProgressSummary {
    TotalSessions      int
    CompletedSessions   int
    AverageScore        float64
    BestScore           int
    CurrentStreak       int      // consecutive days with at least 1 session
    RecentScores        []ScoreDataPoint  // last 30 sessions for chart
}
```

#### GetAchievements

**Go signature**: `GetAchievements() ([]AchievementStatus, error)`

**Description**: Returns all achievements with earned/unearned status.

**Returns**: Array of achievements, each with `Earned bool` and `EarnedAt` timestamp if applicable.

### ReferenceService

#### ListReferences

**Go signature**: `ListReferences(mode string) ([]ReferenceImage, error)`

**Description**: Lists available reference images, optionally filtered by exercise mode.

#### GetReference

**Go signature**: `GetReference(referenceID string) (ReferenceImage, error)`

**Description**: Returns a single reference image with its metadata.

### SettingsService

#### GetSettings / UpdateSettings

**Go signatures**:
- `GetSettings() (Settings, error)`
- `UpdateSettings(settings Settings) (Settings, error)`

**Description**: Read and write application settings. The AI API key is stored encrypted at rest.

### Error Handling Convention

All service methods return `(T, error)`. Wails 3 translates Go errors into rejected promises on the frontend. The frontend wraps all binding calls in try/catch and displays errors via a toast notification system.

For structured errors (e.g., validation), services return a custom error type:

```
type AppError struct {
    Code    string  // machine-readable: "INVALID_MODE", "SESSION_NOT_FOUND", etc.
    Message string  // human-readable message for display
}
```

---

## 7. AI Feedback Integration

### Architecture

```
+----------------+     +------------------+     +------------------+
| FeedbackService| --> | AI Client        | --> | AI Vision API    |
|                |     | (internal/ai/)   |     | (OpenAI/Claude)  |
|                |     |                  |     |                  |
| 1. Load images |     | 1. Build request |     | 1. Analyze images|
| 2. Call client |     | 2. Send HTTP     |     | 2. Compare       |
| 3. Parse result|     | 3. Return raw    |     | 3. Return text   |
| 4. Store       |     |    response      |     |                  |
+----------------+     +------------------+     +------------------+
```

### AI Client Interface

The AI client is defined as an interface to allow swapping providers or mocking in tests:

```
type FeedbackClient interface {
    AnalyzeDrawing(ctx context.Context, req AnalysisRequest) (AnalysisResponse, error)
}

type AnalysisRequest struct {
    ReferenceImage  []byte
    UserDrawing     []byte
    ExerciseMode    string   // affects which aspects to evaluate
    PromptOverride  string   // optional, for future customization
}

type AnalysisResponse struct {
    OverallScore       int
    ProportionsScore   int
    LineQualityScore   int
    ColorAccuracyScore int
    Summary            string
    Details            string
    Strengths          []string
    Improvements       []string
    RawResponse        string
}
```

### Prompt Design

The AI prompt is structured to produce consistent, parseable feedback. The prompt instructs the model to:

1. Compare the user drawing against the reference image
2. Evaluate specific categories based on exercise mode:
   - **Line work mode**: proportions, line confidence, line weight consistency, contour accuracy
   - **Coloring mode**: color accuracy, shading, blending, fill consistency
   - **Full drawing mode**: all categories
3. Provide scores on a 0-100 scale for each category
4. Write a short encouraging summary (2-3 sentences)
5. List 2-3 specific strengths
6. List 2-3 specific areas for improvement with actionable suggestions
7. Return the response in a structured JSON format

The prompt template is stored in `internal/ai/prompt.go` and uses Go's `text/template` for mode-specific sections.

### Response Parsing

The AI is instructed to return JSON. The Go client parses it into `AnalysisResponse`. If parsing fails (the AI returns unstructured text), a fallback parser attempts to extract scores and text from the raw response. If that also fails, the raw response is stored and displayed as plain text feedback.

### Rate Limiting and Cost Control

- The AI API is called only when the user explicitly submits a drawing and requests feedback -- never automatically.
- A simple in-memory rate limiter prevents more than N requests per minute (configurable, default 5).
- API call costs are kept low by resizing images before sending (max 1024x1024 pixels).

### Offline Behavior

If the AI API is unreachable, `RequestFeedback` returns an error. The frontend displays a message indicating feedback is unavailable and offers to retry. The drawing is still saved locally so the user can request feedback later.

---

## 8. Gamification Design

### Scoring

Each completed session receives an overall score (0-100) from the AI feedback. Sub-scores for proportions, line quality, and color accuracy provide detailed breakdowns.

### Achievement System

Achievements are predefined in the database (seeded via migration). They are evaluated after each session by `ProgressService.CheckAndAwardAchievements`. Examples:

| Achievement | Criteria Type | Criteria Value | Description |
|-------------|--------------|----------------|-------------|
| First Steps | session_count | 1 | Complete your first session |
| Getting Started | session_count | 5 | Complete 5 sessions |
| Dedicated Artist | session_count | 25 | Complete 25 sessions |
| Perfectionist | score_threshold | 90 | Score 90 or above on a session |
| Line Master | mode_session_count | 10 | Complete 10 line work sessions |
| Color Wizard | mode_session_count | 10 | Complete 10 coloring sessions |
| On a Roll | streak | 3 | Practice 3 days in a row |
| Week Warrior | streak | 7 | Practice 7 days in a row |
| Improving | score_improvement | 10 | Improve your average score by 10 points |

Achievement evaluation logic is simple: query the relevant aggregate from the database, compare against the criteria value, and award if met and not already earned.

---

## 9. Testing Strategy

### Frontend Unit Tests (vitest)

**Framework**: vitest with React Testing Library

**What to test**:
- Component rendering and user interaction (button clicks, mode selection)
- Drawing canvas tool switching and undo/redo logic
- Session flow state transitions (start -> drawing -> submit -> feedback)
- Score display and achievement rendering
- Error states (API failure, missing data)

**Mocking Wails bindings**: In test environments, Wails bindings are not available. Create a mock module at `frontend/src/__mocks__/bindings/` that exports the same function signatures as the generated bindings, returning canned data. vitest's module aliasing (`vi.mock`) handles the swap.

**Configuration**: `vitest.config.ts` at the frontend root, with path aliases matching the Next.js `tsconfig.json`.

### Backend Unit Tests (Go testing)

**Framework**: Go standard `testing` package with `testify` for assertions.

**What to test**:
- Service layer logic: session lifecycle, achievement evaluation, progress aggregation
- Repository layer: SQL queries against an in-memory SQLite database
- AI client: response parsing, error handling, prompt construction
- Settings encryption/decryption

**Mocking**: The AI client interface allows injecting a mock implementation in tests. Repository tests use an in-memory SQLite database (`":memory:"`) so they are fast and isolated.

### E2E Tests (Playwright)

**Framework**: **Playwright**

**Rationale**: Wails 3 in development mode exposes the full application (frontend and backend bindings) at `http://localhost:34115`. Playwright can test against this URL, exercising the complete integrated system -- frontend rendering, Wails binding calls, Go service logic, and database operations. This is the approach recommended by the Wails community.

**Setup**:
1. Start the app with `wails3 dev` (or the project's dev task)
2. Playwright connects to `http://localhost:34115`
3. Tests interact with the full UI: select a reference, draw on the canvas, submit, verify feedback appears

**What to test**:
- Full session flow: start session, draw something, submit, view feedback
- Navigation between pages
- Session history appears on progress page
- Achievement notifications after qualifying sessions
- Settings persistence (change a setting, reload, verify it persists)

**Configuration**: `playwright.config.ts` at the project root, configured with `baseURL: 'http://localhost:34115'` and a `webServer` block that starts `wails3 dev`.

**Canvas interaction**: For drawing on the HTML5 canvas, Playwright's `page.mouse.move()` and `page.mouse.down()` / `page.mouse.up()` methods can simulate brush strokes. Tests do not need to produce artistically valid drawings -- the goal is to verify the submit-and-feedback pipeline works.

### Test Directory Layout

```
frontend/
  src/
    __tests__/              -- vitest unit tests, mirroring src/ structure
    __mocks__/
      bindings/             -- Mock Wails bindings for unit tests
  vitest.config.ts
internal/
  service/
    session_test.go
    feedback_test.go
    progress_test.go
  repository/
    session_test.go
    drawing_test.go
    feedback_test.go
  ai/
    client_test.go
    prompt_test.go
e2e/
  tests/
    session-flow.spec.ts
    progress.spec.ts
    settings.spec.ts
  playwright.config.ts
```

---

## 10. Project Structure

```
anime-craft/
  main.go                          -- Wails app entry point, service registration
  go.mod
  go.sum
  wails.json                       -- Wails project configuration
  Taskfile.yml                     -- Build tasks (Wails 3 uses Task instead of Make)
  build/                           -- Wails build artifacts and platform configs
    appicon.png
    darwin/
    windows/
    linux/
  docs/
    product-spec.md
    architecture.md
  internal/                        -- Go backend (not importable by external packages)
    service/
      session.go                   -- SessionService struct and methods
      drawing.go                   -- DrawingService struct and methods
      feedback.go                  -- FeedbackService struct and methods
      progress.go                  -- ProgressService struct and methods
      reference.go                 -- ReferenceService struct and methods
      settings.go                  -- SettingsService struct and methods
      session_test.go
      feedback_test.go
      progress_test.go
    repository/
      db.go                        -- SQLite connection, migration runner
      session.go                   -- Session SQL queries (generated by sqlc)
      drawing.go                   -- Drawing SQL queries
      feedback.go                  -- Feedback SQL queries
      achievement.go               -- Achievement SQL queries
      queries/                     -- Raw SQL files for sqlc
        session.sql
        drawing.sql
        feedback.sql
        achievement.sql
        settings.sql
      migrations/
        001_initial_schema.sql
        002_seed_achievements.sql
        003_seed_reference_images.sql
      session_test.go
      drawing_test.go
      feedback_test.go
    ai/
      client.go                    -- FeedbackClient interface
      openai.go                    -- OpenAI vision API implementation
      anthropic.go                 -- Claude vision API implementation (future)
      prompt.go                    -- Prompt templates
      client_test.go
      prompt_test.go
    model/
      types.go                     -- Shared domain types (Session, Drawing, Feedback, etc.)
  frontend/
    next.config.js                 -- Next.js config with static export
    package.json
    tsconfig.json
    vitest.config.ts
    bindings/                      -- Auto-generated by Wails (do not edit)
      animecraft/
        SessionService.ts
        DrawingService.ts
        FeedbackService.ts
        ProgressService.ts
        ReferenceService.ts
        SettingsService.ts
        models.ts
    src/
      app/                         -- Next.js App Router pages
        page.tsx                   -- Home page
        session/
          [id]/
            page.tsx               -- Drawing session page
            feedback/
              page.tsx             -- Feedback review page
        progress/
          page.tsx                 -- Progress dashboard
        settings/
          page.tsx                 -- App settings
        layout.tsx                 -- Root layout with sidebar
        globals.css
      components/
        drawing/
          DrawingCanvas.tsx        -- Canvas component with drawing logic
          ToolBar.tsx              -- Brush, eraser, color picker
          CanvasLayer.tsx          -- Individual canvas layer
        session/
          ReferenceImageViewer.tsx
          SessionControls.tsx
          ExerciseModeSelector.tsx
        feedback/
          ScoreDisplay.tsx
          CategoryBreakdown.tsx
          FeedbackComments.tsx
          SideBySideComparison.tsx
        progress/
          SessionHistoryList.tsx
          ScoreChart.tsx
          AchievementsList.tsx
        ui/
          Button.tsx
          Card.tsx
          Toast.tsx
          Sidebar.tsx
      contexts/
        SessionContext.tsx          -- Active session state management
      hooks/
        useDrawingCanvas.ts        -- Canvas drawing logic hook
        useSession.ts              -- Session lifecycle hook
      lib/
        utils.ts                   -- Shared utilities
      __tests__/                   -- vitest unit tests
      __mocks__/
        bindings/                  -- Mock Wails bindings for tests
  e2e/
    tests/
      session-flow.spec.ts
      progress.spec.ts
      settings.spec.ts
    playwright.config.ts
  references/                      -- Bundled reference images (shipped with app)
    line_work/
    coloring/
    full_drawing/
```

---

## 11. Trade-offs and Decisions

### Decision 1: SQLite vs. Embedded Key-Value Store

**Options considered**:
- **SQLite**: Relational, SQL queries, mature tooling, sqlc for type-safe Go code
- **BoltDB / Badger**: Simpler key-value storage, no SQL

**Decision**: SQLite. The data model has clear relational structure (sessions have drawings, feedback, achievements). SQL queries for aggregation (average scores, streaks, counts) are straightforward. sqlc generates type-safe Go code from SQL, keeping the repository layer thin and correct.

### Decision 2: Canvas Library vs. Raw Canvas API

**Options considered**:
- **Fabric.js / Konva.js**: Full-featured canvas libraries with object model, built-in tools
- **Raw HTML5 Canvas API** with minimal helpers (e.g., `perfect-freehand`)

**Decision**: Raw Canvas API with minimal helpers. For MVP, the drawing tools are simple (freehand brush, eraser, undo). A full canvas library adds bundle size and complexity that is not needed. If the tool requirements grow (layers, transforms, selection), a library can be introduced later.

### Decision 3: AI Provider Abstraction

**Options considered**:
- **Hard-code OpenAI only**: Simpler, fewer abstractions
- **Interface-based abstraction**: Swap providers without changing service logic

**Decision**: Interface-based abstraction. The `FeedbackClient` interface adds minimal complexity but allows testing with mocks and switching to Claude or another provider without modifying the feedback service. Given the rapid evolution of AI APIs, this flexibility is worth the small cost.

### Decision 4: Static Next.js Export vs. Server-Side Rendering

**Options considered**:
- **Static export** (`output: 'export'`): Compatible with Wails, no Node.js server needed
- **SSR with embedded Node.js**: More Next.js features, but complex setup

**Decision**: Static export. Wails serves the frontend as static files from the compiled binary. There is no Node.js server at runtime. This means no API routes, no server components, and no ISR -- but none of these are needed. All data flows through Wails bindings. The static export is simpler, faster to build, and fully compatible with Wails 3.

### Decision 5: Image Storage on Disk vs. In Database

**Options considered**:
- **Store images as BLOBs in SQLite**: Single file for all data, simpler backup
- **Store images as files on disk**: SQLite stores only metadata and paths

**Decision**: Files on disk. Drawing PNGs can be several hundred KB to a few MB each. Storing them as BLOBs would bloat the database and slow down queries. Files on disk are also easier to debug (you can open them directly) and simpler to send to the AI API.

---

## 12. Open Questions

1. **Reference image sourcing**: The architecture supports bundled reference images shipped with the app (`references/` directory). Should the app also allow users to import their own reference images? This would require a file picker dialog (Wails provides native dialogs) and validation logic.

2. **AI provider selection**: The architecture abstracts the AI client. For MVP, which provider should be the default -- OpenAI (GPT-4 Vision) or Anthropic (Claude with vision)? The choice affects prompt tuning and response parsing.

3. **Offline drawing without feedback**: The current design allows drawing and saving without an internet connection, but feedback requires API access. Should the app queue feedback requests for when connectivity is restored, or is a simple "retry" button sufficient for MVP?

4. **Canvas pressure sensitivity**: Should the MVP support pressure-sensitive input from drawing tablets, or is fixed-width brush strokes sufficient to start? Pressure sensitivity improves the drawing experience significantly but adds complexity to the canvas implementation.

5. **Data export/backup**: Should users be able to export their session history, drawings, and progress? The SQLite database and image files could be zipped for backup, but this is not in the current product spec.
