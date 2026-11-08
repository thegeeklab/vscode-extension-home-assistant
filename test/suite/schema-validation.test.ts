import * as assert from "assert"
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { delay, waitForDiagnostics } from "../helpers/waitFor.js"

suite("Schema Validation Tests", () => {
  let workspacePath: string

  suiteSetup(() => {
    workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ""
    vscode.window.showInformationMessage("Starting schema validation tests...")
  })

  // Create or update a test file with schema validation content
  async function createTestFile(
    content: string,
    fileName = "test-schema-validation.yaml"
  ): Promise<vscode.TextDocument> {
    const testFilePath = path.join(workspacePath, fileName)
    await fs.writeFile(testFilePath, content)
    return await vscode.workspace.openTextDocument(testFilePath)
  }

  // Helper function for more flexible schema validation testing
  async function testSchemaValidation(
    content: string,
    fileName = "test-schema-validation.yaml"
  ): Promise<{ document: vscode.TextDocument; diagnostics: vscode.Diagnostic[] }> {
    const document = await createTestFile(content, fileName)

    // Open the document and force a re-validation
    const editor = await vscode.window.showTextDocument(document, { preview: false })

    // Force multiple edits to trigger validation
    for (let i = 0; i < 2; i++) {
      await editor.edit((editBuilder) => {
        // Make a small change to trigger re-validation
        editBuilder.insert(new vscode.Position(0, 0), "\n")
        editBuilder.delete(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)))
      })

      // Small delay between edits
      await delay(200)
    }

    // Try to trigger validation explicitly if available
    try {
      await vscode.commands.executeCommand("editor.action.triggerSuggest")
      await vscode.commands.executeCommand("yaml.doValidation")
    } catch {
      console.log("Info: Could not explicitly trigger validation")
    }

    // Wait for diagnostics to settle
    const diagnostics = await waitForDiagnostics(document, () => true, {
      timeoutMs: 8000,
      settleMs: 1000,
      message: `diagnostics for ${fileName}`
    })
    console.log(`Got ${diagnostics.length} diagnostics for ${fileName}`)
    return { document, diagnostics }
  }

  test("Automation schema accepts notes, weekday and selector triggers", async () => {
    const { diagnostics } = await testSchemaValidation(
      `
automation:
  - id: selector_trigger_test
    alias: Selector Trigger Test
    trigger:
      - trigger: time
        at: "08:00:00"
        weekday:
          - mon
          - wed
          - fri
        note: "Only on weekdays"
      - trigger: calendar.event_started
        target:
          entity_id: calendar.work
        options:
          offset: "-00:15:00"
          offset_type: before
        note: "Starts soon"
      - trigger: calendar.event_ended
        target:
          entity_id: calendar.work
      - trigger: climate.hvac_mode_changed
        target:
          entity_id: climate.living_room
        options:
          behavior: any
          for: "00:10:00"
          hvac_mode:
            - heat
            - cool
      - trigger: event.received
        target:
          entity_id: sensor.some_sensor
        options:
          event_type: custom_event
        note: "Custom event"
    condition:
      - condition: temperature.is_value
        target:
          entity_id: sensor.outside_temperature
        options:
          behavior: all
          for: "00:05:00"
          threshold:
            type: above
            value: 20
        note: "Above 20 degrees"
    action:
      - action: light.turn_on
        note: "Turn on the light"
        target:
          entity_id: light.living_room
`
    )

    const schemaErrors = diagnostics.filter(
      (d) => d.source === "yaml-schema" || d.message.includes("schema")
    )

    assert.strictEqual(
      schemaErrors.length,
      0,
      `Notes, weekday and selector triggers should not produce schema errors: ${schemaErrors
        .map((d) => d.message)
        .join("; ")}`
    )
  })

  test("Temperature condition accepts between and outside thresholds", async () => {
    const { diagnostics } = await testSchemaValidation(
      `
automation:
  - id: temperature_threshold_test
    alias: Temperature Threshold Test
    trigger:
      - trigger: state
        entity_id: sensor.outside_temperature
    condition:
      - condition: temperature.is_value
        target:
          entity_id: sensor.outside_temperature
        options:
          behavior: all
          for: "00:05:00"
          threshold:
            type: between
            value_min: 18
            value_max: 24
      - condition: temperature.is_value
        target:
          entity_id: sensor.outside_temperature
        options:
          threshold:
            type: outside
            value_min: 18
            value_max: 24
`,
      "test-temperature-condition.yaml"
    )

    const schemaErrors = diagnostics.filter(
      (d) => d.source === "yaml-schema" || d.message.includes("schema")
    )

    assert.strictEqual(
      schemaErrors.length,
      0,
      `Temperature between/outside thresholds should not produce schema errors: ${schemaErrors
        .map((d) => d.message)
        .join("; ")}`
    )
  })

  // This is a structural unit test of the generated schema, not an integration test.
  // It exists because the YAML language server's anyOf union matching with catch-all
  // branches (e.g., DeviceTrigger with additionalProperties: true) makes it unreliable
  // for testing negative cases (unknown properties being rejected).
  test("Generated schema constrains selector triggers, conditions, and metadata inheritance", async () => {
    const schema = JSON.parse(
      await fs.readFile(
        path.join(
          import.meta.dirname,
          "..",
          "..",
          "..",
          "src",
          "language-service",
          "src",
          "schemas",
          "json",
          "integration-automation.json"
        ),
        "utf-8"
      )
    )

    const climateTrigger = schema.definitions.ClimateHvacModeChangedTrigger
    assert.ok(climateTrigger, "ClimateHvacModeChangedTrigger definition should exist")
    assert.strictEqual(
      climateTrigger.properties.options.additionalProperties,
      false,
      "selector trigger options must reject unknown properties"
    )
    assert.deepStrictEqual(
      climateTrigger.properties.options.properties.behavior.enum,
      ["all", "each", "first"],
      "behavior must be a constrained enum"
    )
    assert.ok(
      climateTrigger.properties.note,
      "selector triggers must inherit note from AutomationMetadata"
    )

    const temperatureCondition = schema.definitions.TemperatureIsValueCondition
    assert.ok(temperatureCondition, "TemperatureIsValueCondition definition should exist")
    assert.strictEqual(
      temperatureCondition.additionalProperties,
      false,
      "condition must reject unknown properties"
    )
    assert.deepStrictEqual(
      temperatureCondition.properties.options.properties.threshold.properties.type.enum,
      ["above", "below", "between", "outside"],
      "threshold type must be a constrained enum"
    )
    assert.ok(
      temperatureCondition.properties.note,
      "conditions must inherit note from AutomationMetadata"
    )

    for (const def of [
      "CalendarEventStartedTrigger",
      "CalendarEventEndedTrigger",
      "EventReceivedTrigger"
    ]) {
      assert.ok(
        schema.definitions[def].properties.note,
        `${def} must inherit note from AutomationMetadata`
      )
    }
  })

  test("Valid automation schema passes validation", async () => {
    // Create a valid automation
    const { diagnostics } = await testSchemaValidation(`
# Valid automation
automation:
  - id: valid_test_automation
    alias: Valid Test Automation
    description: "This is a valid automation for testing schema validation"
    trigger:
      - platform: state
        entity_id: binary_sensor.motion
        to: "on"
    condition:
      - condition: state
        entity_id: input_boolean.test_enabled
        state: "on"
    action:
      - service: light.turn_on
        target:
          entity_id: light.living_room
        data:
          brightness: 255
          transition: 2
`)

    // Expect no schema errors (there might be other types of errors, but we're only
    // concerned with schema validation in this test)
    const schemaErrors = diagnostics.filter(
      (d) => d.source === "yaml-schema" || d.message.includes("schema")
    )

    assert.strictEqual(schemaErrors.length, 0, "Valid automation should have no schema errors")
  })

  test("Invalid automation schema shows validation errors", async () => {
    // Create an automation with schema errors
    const { diagnostics } = await testSchemaValidation(
      `
# Invalid automation
automation:
  - id: invalid_test_automation
    alias: Invalid Test Automation
    # Missing required trigger property
    # trigger:
    #   - platform: state
    #     entity_id: binary_sensor.motion
    action:
      # Invalid service name
      - service: invalid_service
        # Unknown property
        unknown_property: something
`,
      "test-invalid-automation.yaml"
    )

    console.log("Diagnostics found:", diagnostics.length)
    diagnostics.forEach((d) => console.log(`Line ${d.range.start.line}: ${d.message}`))

    assert.ok(
      diagnostics.some((d) => d.message.includes("unknown_property")),
      "Schema validation should flag the unknown_property"
    )
  })

  test("Script schema validation works", async () => {
    // Create a script with one valid and one invalid example
    const { diagnostics } = await testSchemaValidation(
      `
# Script schema validation test
script:
  valid_script:
    alias: Valid Script
    sequence:
      - service: light.turn_on
        target:
          entity_id: light.kitchen
  
  invalid_script:
    alias: Invalid Script
    # Misspelled property name
    sequenze:
      - service: light.turn_on
        target:
          entity_id: light.kitchen
`,
      "test-script-validation.yaml"
    )

    console.log("Script diagnostics found:", diagnostics.length)
    diagnostics.forEach((d) => console.log(`Line ${d.range.start.line}: ${d.message}`))

    assert.ok(
      diagnostics.some((d) => d.message.includes("sequenze")),
      "Schema validation should flag the misspelled 'sequenze' property"
    )
  })

  test("Sensor schema validation works", async () => {
    // Create a sensor configuration with valid and invalid examples
    const { diagnostics } = await testSchemaValidation(
      `
# Sensor schema validation test
sensor:
  - platform: template
    sensors:
      valid_sensor:
        friendly_name: Valid Sensor
        value_template: "{{ states('sensor.temperature') }}"
      
      invalid_sensor:
        friendly_name: Invalid Sensor
        # Missing required value_template property
        # value_template: "{{ states('sensor.temperature') }}"
        # Invalid property
        invalid_property: something
`,
      "test-sensor-validation.yaml"
    )

    console.log("Sensor diagnostics found:", diagnostics.length)
    diagnostics.forEach((d) => console.log(`Line ${d.range.start.line}: ${d.message}`))

    assert.ok(
      diagnostics.some((d) => d.message.includes("invalid_property")),
      "Schema validation should flag the invalid_property"
    )
  })
})
