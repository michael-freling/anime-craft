import { createContext, useContext, useReducer, ReactNode } from "react";

interface SessionState {
  sessionId: string | null;
  referenceImageId: string | null;
  exerciseMode: string | null;
  status: "idle" | "drawing" | "submitting" | "submitted";
  startTime: number | null;
  elapsedSeconds: number;
}

type SessionAction =
  | {
      type: "START_SESSION";
      sessionId: string;
      referenceImageId: string;
      exerciseMode: string;
    }
  | { type: "TICK" }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_COMPLETE" }
  | { type: "DISCARD" }
  | { type: "RESET" };

const initialState: SessionState = {
  sessionId: null,
  referenceImageId: null,
  exerciseMode: null,
  status: "idle",
  startTime: null,
  elapsedSeconds: 0,
};

function sessionReducer(
  state: SessionState,
  action: SessionAction
): SessionState {
  switch (action.type) {
    case "START_SESSION":
      return {
        ...state,
        sessionId: action.sessionId,
        referenceImageId: action.referenceImageId,
        exerciseMode: action.exerciseMode,
        status: "drawing",
        startTime: Date.now(),
        elapsedSeconds: 0,
      };
    case "TICK":
      if (!state.startTime) return state;
      return {
        ...state,
        elapsedSeconds: Math.floor((Date.now() - state.startTime) / 1000),
      };
    case "SUBMIT_START":
      return { ...state, status: "submitting" };
    case "SUBMIT_COMPLETE":
      return { ...state, status: "submitted" };
    case "DISCARD":
      return initialState;
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

const SessionContext = createContext<{
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
} | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  return (
    <SessionContext.Provider value={{ state, dispatch }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
