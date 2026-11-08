import * as path from "path"
import * as fs from "fs/promises"
import * as vscodeUri from "vscode-uri"
import { JSONSchema } from "vscode-json-languageservice"
import { HaFileInfo } from "../haConfig/dto.js"

export class SchemaServiceForIncludes {
  private mappings: (PathToSchemaMapping & { schema: JSONSchema })[]

  private constructor() {
    this.mappings = []
  }

  public static async create(): Promise<SchemaServiceForIncludes> {
    const instance = new SchemaServiceForIncludes()
    await instance.initialize()
    return instance
  }

  private async initialize(): Promise<void> {
    const jsonPathMappings = path.join(import.meta.dirname, "mappings.json")
    const mappingFileContents = await fs.readFile(jsonPathMappings, "utf-8")
    this.mappings = JSON.parse(mappingFileContents)
    for (const mapping of this.mappings) {
      const jsonPath = path.join(import.meta.dirname, "json", mapping.file)
      const filecontents = await fs.readFile(jsonPath, "utf-8")
      const schema = JSON.parse(filecontents) as JSONSchema
      mapping.schema = schema
    }
  }

  public async getSchemaContributions(haFiles: HaFileInfo[]): Promise<any> {
    const results: {
      uri: string
      fileMatch?: string[]
      schema?: JSONSchema
    }[] = []

    for (const [sourceFile, sourceFileMapping] of haFiles.entries()) {
      let sourceFileMappingPath = sourceFileMapping.path

      // Package files (dir or named includes) use the configuration-root packages schema
      if (/(^|\/)homeassistant\/packages(\/|$)/.test(sourceFileMappingPath.replace(/\\/g, "/"))) {
        sourceFileMappingPath = "configuration.yaml/homeassistant/packages"
      }

      sourceFileMappingPath = sourceFileMappingPath.replace(/cards(\/|\\)cards/g, "cards")

      if (
        sourceFileMappingPath.startsWith(path.join("blueprints", "automation") + path.sep) ||
        sourceFileMappingPath.startsWith("blueprints/automation/")
      ) {
        sourceFileMappingPath = "blueprints/automation"
      }

      if (
        sourceFileMappingPath.startsWith(path.join("blueprints", "script") + path.sep) ||
        sourceFileMappingPath.startsWith("blueprints/script/")
      ) {
        sourceFileMappingPath = "blueprints/script"
      }

      if (
        sourceFileMappingPath.startsWith(path.join("blueprints", "template") + path.sep) ||
        sourceFileMappingPath.startsWith("blueprints/template/")
      ) {
        sourceFileMappingPath = "blueprints/template"
      }

      if (
        sourceFileMappingPath.startsWith(`automations${path.sep}`) ||
        sourceFileMappingPath.startsWith("automations/") ||
        sourceFileMappingPath === "automations.yaml"
      ) {
        sourceFileMappingPath = "configuration.yaml/automation"
      }

      // Labeled includes: `automation ui: !include ...`
      if (/^configuration\.yaml\/automation(\s+.+)?$/.test(sourceFileMappingPath)) {
        sourceFileMappingPath = "configuration.yaml/automation"
      }

      if (
        sourceFileMappingPath.startsWith(`groups${path.sep}`) ||
        sourceFileMappingPath.startsWith("groups/") ||
        sourceFileMappingPath === "groups.yaml"
      ) {
        sourceFileMappingPath = "configuration.yaml/group"
      }

      if (
        sourceFileMappingPath.startsWith(`custom_sentences${path.sep}`) ||
        sourceFileMappingPath.startsWith("custom_sentences/")
      ) {
        sourceFileMappingPath = "custom_sentences.yaml"
      }

      const relatedPathToSchemaMapping = this.mappings.find(
        (x) => x.path === sourceFileMappingPath
      )
      if (relatedPathToSchemaMapping) {
        const id = `http://schemas.home-assistant.io/${relatedPathToSchemaMapping.key}`
        // yaml-language-server's getSchemaCandidatesForResource matches the raw
        // document URI (VS Code uses encoded Windows drive letters like c%3A) and
        // does not normalize before picomatch. Use URI.toString() (encoded).
        let absolutePath: string
        try {
          absolutePath = await fs.realpath(haFiles[sourceFile].filename)
        } catch {
          // The file does not exist (e.g. an !include referencing a file that
          // has not been created yet). Skip it instead of failing the whole
          // schema update.
          continue
        }
        const fileUri = vscodeUri.URI.file(absolutePath)
        const fileass = fileUri.toString() // encoded: file:///c%3A/...
        const fileassUnencoded = fileUri.toString(true) // file:///c:/...
        let resultEntry = results.find((x) => x.uri === id)

        console.log(`Assigning ${fileass} the ${relatedPathToSchemaMapping.path} schema`)

        if (!resultEntry) {
          resultEntry = {
            uri: id,
            // Include both forms for clients that normalize URIs differently.
            fileMatch: [fileass, fileassUnencoded],
            schema: relatedPathToSchemaMapping.schema
          }
          results.push(resultEntry)
        } else if (resultEntry.fileMatch !== undefined) {
          resultEntry.fileMatch.push(fileass, fileassUnencoded)
        }
      }
    }
    return results
  }
}

export interface PathToSchemaMapping {
  key: string
  path: string
  file: string
  tsFile: string
  fromType: string
}
