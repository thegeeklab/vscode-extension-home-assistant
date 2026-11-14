/**
 * Generate the JSON schemas used by the Home Assistant language service.
 *
 * Two generators share this entry point:
 *   - configuration: hand-maintained types in src/language-service/src/schemas
 *     (configuration.yaml, integrations, blueprints, custom sentences)
 *     converted with `typescript-json-schema`.
 *   - Lovelace: card/view/dashboard schemas generated from the upstream
 *     `home-assistant/frontend` TypeScript source using the TypeScript
 *     compiler API directly.
 *
 * The Lovelace types reference `keyof TranslationDict[...]` (itself
 * `typeof import("./translations/en.json")`), which expands to large unions
 * from a massive JSON import. The compiler API is used directly to keep
 * `resolveJsonModule` off and degrade those types gracefully. Index
 * signatures are intentionally NOT emitted so every generated object gets
 * `additionalProperties: false`. Only `custom:*` cards remain permissive.
 *
 * Human hover descriptions are overlaid from `lovelace-descriptions.json`;
 * `--strict` exits non-zero when that overlay references a card or property
 * that no longer exists upstream, or when a card cannot be matched to its
 * config interface (used as a CI gate).
 *
 * Usage:
 *   node scripts/schema/index.ts [--strict]
 */

import { generateConfigurationSchemas } from "./configuration.ts"
import { generateLovelaceSchemas } from "./lovelace.ts"

function main(): void {
  const strict = process.argv.includes("--strict")

  generateConfigurationSchemas()
  const issues = generateLovelaceSchemas(strict)
  if (strict && issues > 0) {
    process.exitCode = 1
  }
}

main()
