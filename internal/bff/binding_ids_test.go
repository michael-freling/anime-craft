package bff

import (
	"fmt"
	"hash/fnv"
	"os"
	"regexp"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestBindingIDs verifies that the FNV-1a 32-bit hashes used in the generated
// TypeScript binding file match what the Go runtime computes for each method
// of ReferenceService.
//
// Wails 3 uses hash/fnv (FNV-1a 32-bit) on the fully-qualified method name
// "{PkgPath}.{TypeName}.{MethodName}" to produce binding IDs.
func TestBindingIDs(t *testing.T) {
	const pkgPath = "github.com/michael-freling/anime-craft/internal/bff"
	const typeName = "ReferenceService"

	methods := []string{
		"AddReference",
		"AddReferenceByFilePath",
		"DeleteReference",
		"GetReference",
		"GetReferenceImageData",
		"ListReferences",
	}

	// Read the generated binding file (may be .ts or .js depending on how bindings were generated).
	// Skip if bindings haven't been generated (e.g., in CI without wails3 generate).
	bindingBase := "../../frontend/bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice"
	bindingData, err := os.ReadFile(bindingBase + ".ts")
	if err != nil {
		bindingData, err = os.ReadFile(bindingBase + ".js")
	}
	if err != nil {
		t.Skipf("binding file not found at %s(.ts|.js) — skipping (run wails3 generate bindings first)", bindingBase)
	}

	bindingContent := string(bindingData)

	// Extract all IDs from $Call.ByID(ID, ...) patterns
	// The regex captures the function name (from the export line) and the ID
	idPattern := regexp.MustCompile(`\$Call\.ByID\((\d+)`)
	matches := idPattern.FindAllStringSubmatch(bindingContent, -1)
	require.NotEmpty(t, matches, "no $Call.ByID patterns found in binding file")

	// Build a set of IDs found in the binding file
	bindingIDs := make(map[uint32]bool)
	for _, match := range matches {
		id, err := strconv.ParseUint(match[1], 10, 32)
		require.NoError(t, err)
		bindingIDs[uint32(id)] = true
	}

	// Also build a map from function name to ID by parsing export lines
	// Pattern: export function FuncName(...): ... { \n return $Call.ByID(ID, ...)
	funcIDPattern := regexp.MustCompile(`export function (\w+)\([^)]*\)[^{]*\{[^}]*\$Call\.ByID\((\d+)`)
	funcMatches := funcIDPattern.FindAllStringSubmatch(bindingContent, -1)

	funcToID := make(map[string]uint32)
	for _, match := range funcMatches {
		id, err := strconv.ParseUint(match[2], 10, 32)
		require.NoError(t, err)
		funcToID[match[1]] = uint32(id)
	}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			fqn := fmt.Sprintf("%s.%s.%s", pkgPath, typeName, method)

			// Compute FNV-1a 32-bit hash
			h := fnv.New32a()
			_, err := h.Write([]byte(fqn))
			require.NoError(t, err)
			computedID := h.Sum32()

			t.Logf("FQN: %s", fqn)
			t.Logf("Computed FNV-1a hash: %d", computedID)

			// Verify this ID exists in the binding file
			assert.True(t, bindingIDs[computedID],
				"computed ID %d for %s not found in binding file", computedID, method)

			// Verify the ID is associated with the correct function name
			if bindingID, ok := funcToID[method]; ok {
				assert.Equal(t, computedID, bindingID,
					"ID mismatch for %s: computed %d, binding file has %d",
					method, computedID, bindingID)
			} else {
				t.Errorf("function %s not found in binding file", method)
			}
		})
	}
}
