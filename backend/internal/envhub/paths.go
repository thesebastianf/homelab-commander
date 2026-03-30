package envhub

import "strings"

// ResolveTemplate replaces path preset placeholders in a template string.
//
// Supported placeholders (resolved from settings map):
//   - {{BASE_STACK}} → value of "base_stack_path"
//   - {{BASE_VOL}}   → value of "base_volume_path"
//   - {{TZ}}         → value of "TZ" (also checked in settings)
//   - Any key in the settings map can be referenced as {{KEY}}
func ResolveTemplate(template string, settings map[string]string) string {
	// Map template variable names to setting keys.
	aliases := map[string]string{
		"BASE_STACK": "base_stack_path",
		"BASE_VOL":   "base_volume_path",
	}

	result := template
	for placeholder, settingKey := range aliases {
		if val, ok := settings[settingKey]; ok {
			result = strings.ReplaceAll(result, "{{"+placeholder+"}}", val)
		}
	}

	// Also resolve any {{KEY}} that directly matches a settings key.
	for k, v := range settings {
		upper := strings.ToUpper(k)
		result = strings.ReplaceAll(result, "{{"+upper+"}}", v)
		result = strings.ReplaceAll(result, "{{"+k+"}}", v)
	}

	return result
}
