import * as assert from "assert"
import { TextDocument } from "vscode-languageserver-textdocument"
import { CompletionItemKind, MarkupContent } from "vscode-languageserver-protocol"
import { HomeAssistantLanguageService } from "../../src/language-service/src/haLanguageService.js"
import { createMockLanguageService, MockFileAccessor, MockHaConnection } from "../helpers/mocks.js"

suite("Label Validation Tests", () => {
  let languageService: HomeAssistantLanguageService

  setup(async () => {
    const connection = new MockHaConnection({
      labelCompletions: [
        {
          label: "security",
          detail: "Security",
          kind: CompletionItemKind.Variable,
          data: { isLabel: true },
          documentation: {
            kind: "markdown",
            value: "**security**\n\nSecurity related devices and entities\n\n"
          } as MarkupContent
        },
        {
          label: "automation",
          detail: "Automation",
          kind: CompletionItemKind.Variable,
          data: { isLabel: true },
          documentation: {
            kind: "markdown",
            value: "**automation**\n\nAutomation related devices\n\n"
          } as MarkupContent
        },
        {
          label: "lighting",
          detail: "Lighting",
          kind: CompletionItemKind.Variable,
          data: { isLabel: true },
          documentation: {
            kind: "markdown",
            value: "**lighting**\n\nLighting fixtures and controls\n\n"
          } as MarkupContent
        }
      ]
    })

    languageService = await createMockLanguageService(connection, new MockFileAccessor())
  })

  test("Label validation identifies unknown labels", async () => {
    const testContent = `
automation:
  - alias: "Test Label Validation"
    trigger:
      - platform: state
        entity_id: light.kitchen
    action:
      - service: light.turn_on
        target:
          label_id: security              # This exists
      - service: light.turn_off
        target:
          label_id: non_existing_label    # This doesn't exist
        
# Test with array syntax
script:
  test_script:
    sequence:
      - service: homeassistant.turn_off
        target:
          label_id: 
            - automation                  # This exists
            - fake_label                  # This doesn't exist
          
# Test with inline array
group:
  test_group:
    target:
      label_id: [lighting, non_existing] # One exists, one doesn't

# Test with "label" property instead of "label_id"
automation:
  - alias: "Test Label Property"
    trigger:
      - platform: state
        entity_id: light.test
    action:
      - service: light.turn_on
        target:
          label: security                 # This exists
      - service: light.turn_off
        target:
          label: missing_label            # This doesn't exist
`

    const document = TextDocument.create(
      "file:///test-label-validation.yaml",
      "yaml",
      1,
      testContent
    )

    const diagnostics = await languageService.getDiagnostics(document)

    const labelDiagnostics = Array.from(
      new Set(
        diagnostics
          .filter((d) => d.source === "home-assistant" && d.code === "unknown-label")
          .map((d) => JSON.stringify(d))
      )
    ).map((d: string) => JSON.parse(d))

    console.log(`Found ${labelDiagnostics.length} label validation diagnostics:`)
    for (const diagnostic of labelDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    assert.strictEqual(
      labelDiagnostics.length,
      4,
      `Expected 4 unknown label diagnostics, got ${labelDiagnostics.length}`
    )

    const expectedUnknownLabels = [
      "non_existing_label",
      "fake_label",
      "non_existing",
      "missing_label"
    ]

    const foundUnknownLabels = labelDiagnostics
      .map((d) => {
        const match = d.message.match(/Label '([^']+)'/)
        return match ? match[1] : null
      })
      .filter((e) => e !== null)

    for (const expectedLabel of expectedUnknownLabels) {
      assert.ok(
        foundUnknownLabels.includes(expectedLabel),
        `Expected to find diagnostic for unknown label '${expectedLabel}'`
      )
    }

    const knownLabels = ["security", "automation", "lighting"]
    for (const knownLabel of knownLabels) {
      assert.ok(
        !foundUnknownLabels.includes(knownLabel),
        `Known label '${knownLabel}' should not generate a diagnostic`
      )
    }
  })

  test("Label validation skips templates and special values", async () => {
    const testContent = `
automation:
  - alias: "Test Templates and Special Values"
    trigger:
      - platform: state
        entity_id: light.kitchen
    action:
      - service: light.turn_on
        target:
          label_id: "{{ states.label.template }}"   # Template, should be skipped
      - service: light.turn_off
        target:
          label_id: !secret my_label_id             # Secret, should be skipped
      - service: light.turn_on
        target:
          label_id: all                             # Special value, should be skipped
      - service: light.turn_off
        target:
          label_id: none                            # Special value, should be skipped
      - service: light.toggle
        target:
          label_id: unknown_label                   # Unknown label, should be flagged
          
# Test with "label" property
script:
  test_script:
    sequence:
      - service: homeassistant.turn_on
        target:
          label: "{{ template_label }}"             # Template, should be skipped
      - service: homeassistant.turn_off
        target:
          label: !secret secret_label               # Secret, should be skipped
      - service: homeassistant.toggle
        target:
          label: missing_label_test                 # Unknown label, should be flagged
`

    const document = TextDocument.create(
      "file:///test-templates-specials.yaml",
      "yaml",
      1,
      testContent
    )

    const diagnostics = await languageService.getDiagnostics(document)

    const labelDiagnostics = Array.from(
      new Set(
        diagnostics
          .filter((d) => d.source === "home-assistant" && d.code === "unknown-label")
          .map((d) => JSON.stringify(d))
      )
    ).map((d: string) => JSON.parse(d))

    console.log(
      `Found ${labelDiagnostics.length} label validation diagnostics for templates/special values test:`
    )
    for (const diagnostic of labelDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    assert.strictEqual(
      labelDiagnostics.length,
      2,
      "Should only flag unknown labels, not templates or special values"
    )

    const foundLabels = labelDiagnostics
      .map((d) => {
        const match = d.message.match(/Label '([^']+)'/)
        return match ? match[1] : null
      })
      .filter((l) => l !== null)

    assert.ok(foundLabels.includes("unknown_label"), "Should flag the unknown_label")
    assert.ok(foundLabels.includes("missing_label_test"), "Should flag the missing_label_test")
  })

  test("Label validation handles empty and null values gracefully", async () => {
    const testContent = `
automation:
  - alias: "Test Empty Values"
    trigger:
      - platform: state
        entity_id: light.kitchen
    action:
      - service: light.turn_on
        target:
          label_id: ""                    # Empty string, should be skipped
      - service: light.turn_off
        target:
          label_id: null                  # Null value, should be skipped
      - service: light.toggle
        target:
          label_id:                       # No value, should be skipped
      - service: light.turn_on
        target:
          label_id: []                    # Empty array, should be skipped
`

    const document = TextDocument.create("file:///test-empty-values.yaml", "yaml", 1, testContent)

    const diagnostics = await languageService.getDiagnostics(document)

    const labelDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-label"
    )

    console.log(
      `Found ${labelDiagnostics.length} label validation diagnostics for empty values test:`
    )
    for (const diagnostic of labelDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    assert.strictEqual(labelDiagnostics.length, 0, "Should not flag empty or null values")
  })

  test("Label validation skips commented lines", async () => {
    const testContent = `
# This is a comment with labels: commented_label
automation:
  - alias: "Comment Test"
    trigger:
      - platform: state
        entity_id: sensor.test
    # labels: commented_in_middle
    action:
      - service: light.turn_on
        target:
          # This commented line should be ignored: labels: commented_label
          labels: energy
      # - service: light.turn_off
      #   target:
      #     labels: commented_unknown_label
`

    const document = TextDocument.create(
      "file:///test-label-comments.yaml",
      "yaml",
      1,
      testContent
    )

    const diagnostics = await languageService.getDiagnostics(document)

    const labelDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-label"
    )

    console.log(`Found ${labelDiagnostics.length} label validation diagnostics for comment test:`)
    for (const diagnostic of labelDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    assert.strictEqual(labelDiagnostics.length, 0, "Should not flag labels in commented lines")
  })
})
