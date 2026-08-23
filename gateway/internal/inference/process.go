package inference

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
)

// ProcessManager starts and stops the Python gRPC server as a subprocess.
type ProcessManager struct {
	cmd  *exec.Cmd
	port int
}

// Start launches the Python inference gRPC server. It looks for a pdm-based
// setup first, then falls back to invoking the module directly.
// The process is started in the background; callers should use Client.WaitReady
// to wait for model loading to complete.
func Start(inferenceDir string, port int) (*ProcessManager, error) {
	absDir, err := filepath.Abs(inferenceDir)
	if err != nil {
		return nil, fmt.Errorf("resolve inference dir: %w", err)
	}

	if _, err := os.Stat(absDir); err != nil {
		return nil, fmt.Errorf("inference dir does not exist: %w", err)
	}

	portStr := fmt.Sprintf("%d", port)

	// Try pdm first (checks for pyproject.toml as a signal).
	var cmd *exec.Cmd
	if _, err := os.Stat(filepath.Join(absDir, "pyproject.toml")); err == nil {
		if pdmPath, err := exec.LookPath("pdm"); err == nil {
			cmd = exec.Command(pdmPath, "run", "serve", "--port", portStr)
			cmd.Dir = absDir
			slog.Info("starting inference via pdm", "dir", absDir, "port", port)
		}
	}

	// Fall back to python -m invocation.
	if cmd == nil {
		pythonPath, err := findPython()
		if err != nil {
			return nil, fmt.Errorf("find python: %w", err)
		}
		cmd = exec.Command(pythonPath, "-m", "animecraft_inference.server", "--port", portStr)
		cmd.Dir = absDir
		slog.Info("starting inference via python", "python", pythonPath, "dir", absDir, "port", port)
	}

	// Capture stderr for diagnostics; stdout goes to /dev/null.
	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start inference process: %w", err)
	}

	slog.Info("inference process started", "pid", cmd.Process.Pid, "port", port)

	return &ProcessManager{
		cmd:  cmd,
		port: port,
	}, nil
}

// Stop terminates the inference process.
func (pm *ProcessManager) Stop() error {
	if pm.cmd == nil || pm.cmd.Process == nil {
		return nil
	}
	slog.Info("stopping inference process", "pid", pm.cmd.Process.Pid)
	if err := pm.cmd.Process.Kill(); err != nil {
		return fmt.Errorf("kill inference process: %w", err)
	}
	// Wait to clean up zombie process; ignore error since Kill causes non-zero exit.
	_ = pm.cmd.Wait()
	return nil
}

// Addr returns the address string suitable for gRPC dialing.
func (pm *ProcessManager) Addr() string {
	return fmt.Sprintf("localhost:%d", pm.port)
}

// findPython tries common Python executable names and returns the first found.
func findPython() (string, error) {
	for _, name := range []string{"python3", "python"} {
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("no python executable found in PATH")
}
