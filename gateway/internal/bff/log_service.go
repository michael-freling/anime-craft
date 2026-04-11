package bff

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type LogEntry struct {
	Timestamp string `json:"ts"`
	Source    string `json:"source"`
	Level    string `json:"level"`
	Method   string `json:"method"`
	Message  string `json:"message"`
	Data     string `json:"data,omitempty"`
}

type LogService struct {
	logPath string
	mu      sync.Mutex
}

func NewLogService(dataDir string) *LogService {
	return &LogService{
		logPath: filepath.Join(dataDir, "debug.log"),
	}
}

// Log receives a log entry from the frontend and writes it to the shared log file.
func (s *LogService) Log(level, method, message, data string) {
	entry := LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Source:    "frontend",
		Level:    level,
		Method:   method,
		Message:  message,
		Data:     data,
	}
	s.writeEntry(entry)
}

// WriteBackendLog writes a backend log entry to the shared log file.
func (s *LogService) WriteBackendLog(level, method, message, data string) {
	entry := LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Source:    "backend",
		Level:    level,
		Method:   method,
		Message:  message,
		Data:     data,
	}
	s.writeEntry(entry)
}

// GetLogPath returns the path to the debug log file (for tooling).
func (s *LogService) GetLogPath() string {
	return s.logPath
}

func (s *LogService) writeEntry(entry LogEntry) {
	line, err := json.Marshal(entry)
	if err != nil {
		slog.Error("failed to marshal log entry", "error", err)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	f, err := os.OpenFile(s.logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		slog.Error("failed to open debug log", "path", s.logPath, "error", err)
		return
	}
	defer f.Close()
	fmt.Fprintln(f, string(line))
}
