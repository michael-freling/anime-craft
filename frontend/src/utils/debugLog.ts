import { Log } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/logservice.js";

type LogLevel = "info" | "warn" | "error";

export function debugLog(
  level: LogLevel,
  method: string,
  message: string,
  data?: unknown
): void {
  // Always log to browser console
  const consoleMsg = `[${method}] ${message}`;
  const dataStr = data !== undefined ? JSON.stringify(data) : "";

  switch (level) {
    case "error":
      console.error(consoleMsg, data ?? "");
      break;
    case "warn":
      console.warn(consoleMsg, data ?? "");
      break;
    default:
      console.log(consoleMsg, data ?? "");
  }

  // Send to Go backend for file logging.
  // Fire-and-forget — don't await, don't let logging failures break the app.
  try {
    Log(level, method, message, dataStr);
  } catch {
    // Binding may not be available during tests or SSR
  }
}
