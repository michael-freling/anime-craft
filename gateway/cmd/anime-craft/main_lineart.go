package main

import (
	"log"
	"os"
	"path/filepath"
	"runtime"

	"github.com/michael-freling/anime-craft/gateway/internal/bff"
	"github.com/michael-freling/anime-craft/gateway/internal/lineart"
)

func initLineArtExtractor() bff.LineArtExtractor {
	// Collect candidate directories: executable dir, os.Args[0] dir, and
	// working directory. On WSL->Windows the exe runs from a UNC path
	// (\\wsl.localhost\...) so we try multiple sources.
	seen := map[string]bool{}
	var dirs []string
	addDir := func(label, dir string) {
		dir = filepath.Clean(dir)
		if seen[dir] {
			return
		}
		seen[dir] = true
		dirs = append(dirs, dir)
		log.Printf("Line art: candidate dir (%s) = %s", label, dir)
	}

	if exe, err := os.Executable(); err == nil {
		addDir("executable", filepath.Dir(exe))
	}
	if len(os.Args) > 0 {
		if abs, err := filepath.Abs(filepath.Dir(os.Args[0])); err == nil {
			addDir("argv[0]", abs)
		}
	}
	if wd, err := os.Getwd(); err == nil {
		addDir("cwd", wd)
	}

	var modelPath string
	for _, dir := range dirs {
		candidate := filepath.Join(dir, "inference", "lineart", "anime2sketch.onnx")
		if _, err := os.Stat(candidate); err == nil {
			modelPath = candidate
			log.Printf("Line art: model found at %s", candidate)
			break
		} else {
			log.Printf("Line art: model not at %s: %v", candidate, err)
		}
	}
	if modelPath == "" {
		log.Printf("Warning: line art model not found in any candidate dir, line art disabled")
		return nil
	}

	// On Windows prefer .dll, on Linux prefer .so.
	var libNames []string
	if runtime.GOOS == "windows" {
		libNames = []string{"onnxruntime.dll", "libonnxruntime.so"}
	} else {
		libNames = []string{"libonnxruntime.so", "onnxruntime.dll"}
	}

	var libraryPath string
	for _, dir := range dirs {
		for _, name := range libNames {
			candidate := filepath.Join(dir, "onnxruntime", "lib", name)
			if _, err := os.Stat(candidate); err == nil {
				libraryPath = candidate
				log.Printf("Line art: runtime library found at %s", candidate)
				break
			} else {
				log.Printf("Line art: runtime not at %s: %v", candidate, err)
			}
		}
		if libraryPath != "" {
			break
		}
	}
	if libraryPath == "" {
		log.Printf("Warning: ONNX Runtime library not found in any candidate dir, line art disabled")
		return nil
	}

	// On Windows, add the DLL directory to PATH so dependent DLLs
	// (e.g. onnxruntime_providers_shared.dll) can be found when loading
	// from a UNC path like \\wsl.localhost\...
	if runtime.GOOS == "windows" {
		libDir := filepath.Dir(libraryPath)
		path := os.Getenv("PATH")
		if path != "" {
			_ = os.Setenv("PATH", libDir+";"+path)
		} else {
			_ = os.Setenv("PATH", libDir)
		}
		log.Printf("Line art: added %s to PATH for DLL resolution", libDir)
	}

	ext, err := lineart.NewExtractor(modelPath, libraryPath)
	if err != nil {
		log.Printf("Warning: line art extractor init failed: %v", err)
		return nil
	}
	log.Printf("Line art: extractor initialized (model=%s, library=%s)", modelPath, libraryPath)
	return ext
}
