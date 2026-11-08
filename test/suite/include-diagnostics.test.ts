import * as assert from "assert"
import { TextDocument } from "vscode-languageserver-textdocument"
import { getLanguageService, LanguageService } from "yaml-language-server"
import { HomeAssistantLanguageService } from "../../src/language-service/src/haLanguageService.js"
import { HomeAssistantConfiguration } from "../../src/language-service/src/haConfig/haConfig.js"
import { SchemaServiceForIncludes } from "../../src/language-service/src/schemas/schemaService.js"
import { MockFileAccessor, MockHaConnection } from "../helpers/mocks.js"

suite("Include Diagnostics Filter Tests", () => {
  let languageService: HomeAssistantLanguageService
  let yamlLanguageService: LanguageService

  setup(async () => {
    yamlLanguageService = getLanguageService({
      schemaRequestService: async () => "",
      workspaceContext: null,
      telemetry: undefined
    })

    const haConfig = new HomeAssistantConfiguration(new MockFileAccessor() as any)

    languageService = new HomeAssistantLanguageService(
      yamlLanguageService,
      haConfig,
      new MockHaConnection() as any,
      [],
      await SchemaServiceForIncludes.create(),
      () => {
        /* mock sendDiagnostics */
      },
      () => {
        /* mock diagnoseAllFiles */
      },
      { isConfigured: true, autoRenderTemplates: true } as any
    )

    // Minimal schema that reproduces the Home Assistant include-directive
    // patterns: the value after a custom tag is validated without the tag.
    yamlLanguageService.configure({
      validate: true,
      customTags: [
        "!include scalar",
        "!include_dir_list scalar",
        "!include_dir_named scalar",
        "!include_dir_merge_list scalar",
        "!include_dir_merge_named scalar"
      ],
      schemas: [
        {
          uri: "http://schemas.home-assistant.io/configuration-test",
          fileMatch: ["*.yaml"],
          schema: {
            type: "object",
            properties: {
              lovelace: {
                type: "string",
                pattern: "^!include .*$"
              },
              template: {
                anyOf: [
                  { type: "string", pattern: "^!include_dir_list .*$" },
                  { type: "array", items: { type: "object" } }
                ]
              },
              automation: {
                anyOf: [
                  { type: "string", pattern: "^!include_dir_merge_list .*$" },
                  { type: "array", items: { type: "object" } }
                ]
              },
              script: {
                anyOf: [
                  { type: "string", pattern: "^!include_dir_merge_named .*$" },
                  { type: "object" }
                ]
              },
              packages: {
                anyOf: [{ type: "string", pattern: "^!include_dir_named .*$" }, { type: "object" }]
              },
              control: {
                type: "string",
                pattern: "^!must_match .*$"
              }
            }
          }
        }
      ]
    })
  })

  test("include tags do not produce schema pattern diagnostics", async () => {
    const includeLines = [
      "lovelace: !include ui-lovelace.yaml",
      "template: !include_dir_list templates/",
      "automation: !include_dir_merge_list automations/",
      "script: !include_dir_merge_named scripts",
      "packages: !include_dir_named packages"
    ]
    const content = [...includeLines, "control: nope"].join("\n")

    const document = TextDocument.create("file:///test-include.yaml", "yaml", 1, content)

    const diagnostics = await languageService.getDiagnostics(document)

    const patternDiagnostics = diagnostics.filter(
      (d) =>
        (d.source?.startsWith("yaml-schema") ?? false) ||
        (typeof d.message === "string" && d.message.includes("does not match the pattern"))
    )

    const includeLinePatternDiagnostics = patternDiagnostics.filter(
      (d) => d.range.start.line < includeLines.length
    )

    assert.strictEqual(
      includeLinePatternDiagnostics.length,
      0,
      `Include tags should not produce pattern diagnostics, got ${JSON.stringify(
        includeLinePatternDiagnostics.map((d) => d.message)
      )}`
    )

    // Control: a plain string that violates a pattern is still reported, which
    // proves schema validation is active and the filter only targets includes.
    const controlDiagnostics = patternDiagnostics.filter(
      (d) => d.range.start.line === includeLines.length
    )
    assert.ok(
      controlDiagnostics.length > 0,
      "Expected a pattern diagnostic for the non-include control line"
    )
  })
})
