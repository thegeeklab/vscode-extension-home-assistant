import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import * as path from "node:path"
import * as TJS from "typescript-json-schema"

interface PathToSchemaMapping {
  key: string
  path: string
  file: string
  // Present only for non-Lovelace schemas; the Lovelace entries carry no
  // source type because they are generated from the upstream frontend.
  tsFile?: string
  fromType?: string
}

// Hand-maintained TypeScript types that describe the Home Assistant
// configuration schemas (configuration.yaml, integrations, blueprints,
// custom sentences).
const TYPES_DIR = path.join(import.meta.dirname, "types")

// Runtime-side schema catalog (file -> schema mapping) and generated output.
const RUNTIME_SCHEMAS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "src",
  "language-service",
  "src",
  "schemas"
)

const settings: TJS.PartialArgs = {
  required: true,
  noExtraProps: true
}

const compilerOptions: TJS.CompilerOptions = {
  strictNullChecks: true
}

// Generates the Home Assistant configuration schemas (configuration.yaml,
// integrations, blueprints, custom sentences) from the hand-maintained
// TypeScript types using typescript-json-schema.
export function generateConfigurationSchemas(): void {
  const mappings = readFileSync(path.join(RUNTIME_SCHEMAS_DIR, "mappings.json"), "utf-8")
  const outputFolder = path.join(RUNTIME_SCHEMAS_DIR, "json")

  if (!existsSync(outputFolder)) {
    mkdirSync(outputFolder)
  }

  console.log("Generating schemas...")
  const pathToSchemaMappings: PathToSchemaMapping[] = JSON.parse(mappings)
  for (const mapping of pathToSchemaMappings) {
    // Lovelace schemas are generated from the upstream frontend TypeScript
    // types by the Lovelace generator. They remain in mappings.json for the
    // file -> schema mapping in schemaService.ts but must not be generated here.
    if (mapping.key.startsWith("lovelace-")) {
      continue
    }
    if (!mapping.tsFile || !mapping.fromType) {
      throw new Error(`Missing tsFile/fromType for schema "${mapping.key}"`)
    }
    console.log(mapping.path)
    const program = TJS.getProgramFromFiles(
      [path.resolve(path.join(TYPES_DIR, mapping.tsFile))],
      compilerOptions
    )
    const schema = TJS.generateSchema(program, mapping.fromType, settings)
    if (schema === null) {
      throw new Error(`Schema generation failed for ${mapping.path} (${mapping.fromType})`)
    }
    writeFileSync(path.join(outputFolder, mapping.file), JSON.stringify(schema))
  }
}
