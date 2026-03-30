// Mock implementation of @wailsio/runtime for E2E testing outside of Wails webview.
// Maps Wails function IDs to mock responses.
//
// Function IDs are extracted from the auto-generated bindings in
// frontend/bindings/github.com/michael-freling/anime-craft/internal/bff/*.js.
// If the bindings are regenerated, these IDs may change and must be updated.

const mockReferences = [
  {
    id: "ref-001",
    title: "Simple Face Outline",
    filePath: "references/line_work_face.png",
    exerciseMode: "line_work",
    difficulty: "beginner",
    tags: "face",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "ref-002",
    title: "Eye Detail",
    filePath: "references/line_work_eye.png",
    exerciseMode: "line_work",
    difficulty: "beginner",
    tags: "eye",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const sessions = new Map<string, any>();
const drawings = new Map<string, any>();
const feedbacks = new Map<string, any>();
let sessionCounter = 0;

// Function ID mapping (from Wails-generated bindings)
// IDs sourced from $Call.ByID(...) calls in frontend/bindings/.../bff/*.js
const FUNCTION_IDS: Record<number, (...args: any[]) => any> = {
  // SessionService.StartSession(mode, referenceID) — sessionservice.js
  375712763: (mode: string, referenceID: string) => {
    sessionCounter++;
    const id = `session-${sessionCounter}`;
    const session = {
      id,
      referenceImageId: referenceID,
      exerciseMode: mode,
      status: "drawing",
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationSeconds: null,
    };
    sessions.set(id, session);
    return session;
  },

  // SessionService.GetSession(sessionID) — sessionservice.js
  1991038439: (sessionID: string) => {
    const session = sessions.get(sessionID);
    if (!session) {
      return {
        id: sessionID,
        referenceImageId: "ref-001",
        exerciseMode: "line_work",
        status: "drawing",
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: null,
      };
    }
    return session;
  },

  // SessionService.ListSessions(limit, offset) — sessionservice.js
  4166148666: (_limit: number, _offset: number) => {
    return Array.from(sessions.values());
  },

  // SessionService.EndSession(sessionID) — sessionservice.js
  4087522836: (sessionID: string) => {
    const session = sessions.get(sessionID);
    if (session) {
      session.status = "submitted";
      session.endedAt = new Date().toISOString();
      session.durationSeconds = 60;
    }
    return session || { id: sessionID, status: "submitted" };
  },

  // DrawingService.GetDrawing(sessionID) — drawingservice.js
  1363601511: (sessionID: string) => {
    const drawing = drawings.get(sessionID);
    return (
      drawing || {
        id: `drawing-${sessionID}`,
        sessionId: sessionID,
        filePath: "drawings/mock-drawing.png",
        createdAt: new Date().toISOString(),
      }
    );
  },

  // DrawingService.SaveDrawing(sessionID, imageDataBase64) — drawingservice.js
  961787570: (sessionID: string, _imageDataBase64: string) => {
    const drawing = {
      id: `drawing-${sessionID}`,
      sessionId: sessionID,
      filePath: "drawings/mock-drawing.png",
      createdAt: new Date().toISOString(),
    };
    drawings.set(sessionID, drawing);
    return drawing;
  },

  // FeedbackService.GetFeedback(sessionID) — feedbackservice.js
  1423703831: (sessionID: string) => {
    const fb = feedbacks.get(sessionID);
    if (!fb) {
      throw new Error("No feedback found");
    }
    return fb;
  },

  // FeedbackService.RequestFeedback(sessionID) — feedbackservice.js
  3461105066: (sessionID: string) => {
    const fb = {
      id: `feedback-${sessionID}`,
      sessionId: sessionID,
      overallScore: 72,
      proportionsScore: 68,
      lineQualityScore: 75,
      colorAccuracyScore: null,
      summary: "Good effort on the line work exercise.",
      details:
        "Your lines show good control. Focus on varying line weight for more dynamic results.",
      strengths: [
        "Clean, confident strokes",
        "Good overall proportions",
        "Nice attention to detail in facial features",
      ],
      improvements: [
        "Vary line weight for emphasis",
        "Work on smoother curves",
        "Practice consistent spacing",
      ],
      createdAt: new Date().toISOString(),
    };
    feedbacks.set(sessionID, fb);
    return fb;
  },

  // ReferenceService.AddReference(title, difficulty, imageDataBase64) — referenceservice.js
  980217922: (title: string, difficulty: string, _imageDataBase64: string) => {
    const newRef = {
      id: `ref-upload-${Date.now()}`,
      title,
      filePath: `references/uploads/${title}.png`,
      exerciseMode: "line_work",
      difficulty,
      tags: "",
      createdAt: new Date().toISOString(),
    };
    mockReferences.push(newRef);
    return newRef;
  },

  // ReferenceService.AddReferenceByFilePath(title, difficulty, filePath) — referenceservice.js
  2302175046: (title: string, difficulty: string, _filePath: string) => {
    const newRef = {
      id: `ref-upload-${Date.now()}`,
      title,
      filePath: `references/uploads/${title}.png`,
      exerciseMode: "line_work",
      difficulty,
      tags: "",
      createdAt: new Date().toISOString(),
    };
    mockReferences.push(newRef);
    return newRef;
  },

  // ReferenceService.DeleteReference(id) — referenceservice.js
  3519923638: (id: string) => {
    const idx = mockReferences.findIndex((r) => r.id === id);
    if (idx !== -1) {
      mockReferences.splice(idx, 1);
    }
    return null;
  },

  // ReferenceService.ListReferences(mode) — referenceservice.js
  4178581748: (mode: string) => {
    if (!mode) return mockReferences;
    return mockReferences.filter((r) => r.exerciseMode === mode);
  },

  // ReferenceService.GetReference(referenceID) — referenceservice.js
  12848495: (referenceID: string) => {
    const ref = mockReferences.find((r) => r.id === referenceID);
    return ref || mockReferences[0];
  },

  // ProgressService.GetProgressSummary() — progressservice.js
  79781105: () => ({
    totalSessions: 5,
    completedSessions: 3,
    averageScore: 70,
    bestScore: 85,
    currentStreak: 2,
    recentScores: [],
  }),

  // ProgressService.GetAchievements() — progressservice.js
  3266445496: () => [],

  // SettingsService.GetSettings() — settingsservice.js
  1231161071: () => ({
    aiApiKey: "",
    aiProvider: "openai",
    brushDefaultSize: 3,
    theme: "dark",
  }),

  // SettingsService.UpdateSettings(settings) — settingsservice.js
  2070582106: (settings: any) => settings,
};

class MockCancellablePromise<T> extends Promise<T> {
  cancel() {}
}

export const Call = {
  ByID(id: number, ...args: any[]): any {
    const handler = FUNCTION_IDS[id];
    if (!handler) {
      console.warn(`[wails-mock] Unknown function ID: ${id}`);
      return Promise.resolve(null);
    }
    try {
      const result = handler(...args);
      return Promise.resolve(result);
    } catch (e) {
      return Promise.reject(e);
    }
  },
};

export const CancellablePromise = MockCancellablePromise;

export const Create = {
  Array: (fn: any) => (arr: any[]) => arr?.map(fn) ?? [],
  Any: (v: any) => v,
};
